/**
 * Bokföringsrådgivaren: streamande chatt med read-only-verktyg mot bokföringen.
 * POST { message } → SSE-ström av { type: "text", text } / { type: "status", text } /
 * { type: "done" } / { type: "error", text }. DELETE rensar historiken.
 *
 * OBS: /api/ undantas från inloggnings-proxyn — auth kontrolleras här.
 */

import { createClient } from "@/lib/supabase/server";
import { resolveAiConfig, DEFAULT_ANTHROPIC_MODEL } from "@/lib/ai/provider";
import { buildAdvisorPrompt, ADVISOR_TOOLS, runAdvisorTool } from "@/lib/ai/advisor";
import type { CompanyType } from "@/lib/ai/bookkeeper";

export const maxDuration = 120;

const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 20;

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

const TOOL_STATUS: Record<string, string> = {
  get_balances: "Hämtar kontosaldon…",
  search_verifications: "Söker i verifikaten…",
  get_monthly_result: "Räknar månadsresultat…",
  get_vat_position: "Kollar momsläget…",
  list_unpaid_invoices: "Hämtar obetalda fakturor…",
  lookup_account: "Slår upp i kontoplanen…",
  web_search: "Söker på webben…",
};

/** Anthropics inbyggda webbsökning — körs på serversidan, ingen extra nyckel */
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
};

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { message } = (await req.json().catch(() => ({}))) as { message?: string };
  const userMessage = message?.trim().slice(0, 4000);
  if (!userMessage) return new Response("Tomt meddelande", { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: settings }, { data: history }, { data: ruleRows }] = await Promise.all([
    supabase.from("settings")
      .select("company_name, company_type, vat_period, ai_api_key, ai_model, ai_rules")
      .eq("id", 1).single(),
    supabase.from("advisor_messages").select("role, content")
      .order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
    supabase.from("rule_values").select("key, value")
      .lte("valid_from", today).or(`valid_to.gte.${today},valid_to.is.null`),
  ]);

  const config = resolveAiConfig(settings?.ai_api_key, settings?.ai_model);
  if (!config) {
    return new Response("Ingen AI-nyckel — lägg in en under Inställningar → AI-bokföraren.", { status: 400 });
  }
  // Rådgivaren kräver tool use → Anthropic. OpenAI-nycklar stöds inte här ännu.
  if (config.provider !== "anthropic") {
    return new Response("Rådgivaren kräver en Anthropic-nyckel (sk-ant-…).", { status: 400 });
  }

  const systemPrompt = buildAdvisorPrompt({
    companyType: (settings?.company_type as CompanyType) ?? "enskild_firma",
    companyName: settings?.company_name ?? "företaget",
    customRules: settings?.ai_rules ?? null,
    vatPeriod: settings?.vat_period ?? "kvartal",
    today,
    ruleValues: Object.fromEntries((ruleRows ?? []).map((r) => [r.key, Number(r.value)])),
  });

  const messages: { role: "user" | "assistant"; content: string | ContentBlock[] }[] = [
    ...(history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  await supabase.from("advisor_messages").insert({ role: "user", content: userMessage });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let fullAnswer = "";

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            signal: AbortSignal.timeout(90_000),
            headers: {
              "x-api-key": config.apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: config.model || DEFAULT_ANTHROPIC_MODEL,
              max_tokens: 3500,
              system: systemPrompt,
              tools: [...ADVISOR_TOOLS, WEB_SEARCH_TOOL],
              messages,
            }),
          });
          if (!res.ok) {
            send({ type: "error", text: `AI-fel ${res.status}: ${(await res.text()).slice(0, 300)}` });
            break;
          }
          const data = await res.json() as {
            content: (ContentBlock & { name?: string })[];
            stop_reason: string;
          };

          if (data.content.some((b) => (b as { type: string }).type === "server_tool_use")) {
            send({ type: "status", text: TOOL_STATUS.web_search });
          }
          const textBlocks = data.content.filter((b) => b.type === "text") as { text: string }[];
          for (const b of textBlocks) {
            fullAnswer += (fullAnswer ? "\n\n" : "") + b.text;
            send({ type: "text", text: b.text });
          }

          // pause_turn: webbsökningen behöver fler varv — skicka tillbaka och fortsätt
          if (data.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: data.content as ContentBlock[] });
            continue;
          }
          if (data.stop_reason !== "tool_use") break;

          const toolUses = data.content.filter((b) => b.type === "tool_use") as
            Extract<ContentBlock, { type: "tool_use" }>[];
          messages.push({ role: "assistant", content: data.content });

          const results: ContentBlock[] = [];
          for (const tu of toolUses) {
            send({ type: "status", text: TOOL_STATUS[tu.name] ?? "Arbetar…" });
            const result = await runAdvisorTool(supabase, tu.name, tu.input ?? {});
            results.push({ type: "tool_result", tool_use_id: tu.id, content: result.slice(0, 30000) });
          }
          messages.push({ role: "user", content: results });
        }

        if (fullAnswer) {
          await supabase.from("advisor_messages").insert({ role: "assistant", content: fullAnswer });
        } else {
          send({ type: "error", text: "Rådgivaren fick inte fram ett svar — prova att formulera om frågan." });
        }
        send({ type: "done" });
      } catch (e) {
        send({
          type: "error",
          text: (e as Error).name === "TimeoutError"
            ? "AI-anropet tog för lång tid — prova igen."
            : (e as Error).message,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Rensa konversationen */
export async function DELETE(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { error } = await supabase.from("advisor_messages")
    .delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
}

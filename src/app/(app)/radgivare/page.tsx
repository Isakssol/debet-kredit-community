import { createClient } from "@/lib/supabase/server";
import { resolveAiConfig } from "@/lib/ai/provider";
import { AdvisorChat } from "@/components/advisor-chat";
import { ConversationList } from "@/components/conversation-list";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdvisorPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: selectedId } = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, { data: conversations }] = await Promise.all([
    supabase.from("settings").select("ai_api_key, ai_model").eq("id", 1).single(),
    supabase.from("advisor_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false }).limit(50),
  ]);

  const active = (conversations ?? []).find((x) => x.id === selectedId) ?? null;
  const { data: history } = active
    ? await supabase.from("advisor_messages").select("role, content")
        .eq("conversation_id", active.id).order("created_at", { ascending: true }).limit(200)
    : { data: [] };

  const ready = !!resolveAiConfig(settings?.ai_api_key, settings?.ai_model)
    && resolveAiConfig(settings?.ai_api_key, settings?.ai_model)?.provider === "anthropic";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rådgivaren</h1>
        <p className="text-sm text-muted-foreground">
          Fråga om din bokföring, moms och avdrag — rådgivaren läser bokföringen och
          söker på webben innan den svarar. Konversationerna sparas i historiken.
        </p>
      </div>

      {ready ? (
        <div className="grid lg:grid-cols-[240px_1fr] gap-4 items-start">
          <ConversationList
            conversations={(conversations ?? []).map((x) => ({
              id: x.id, title: x.title, updatedAt: x.updated_at,
            }))}
            activeId={active?.id ?? null}
          />
          <AdvisorChat
            key={active?.id ?? "new"}
            conversationId={active?.id ?? null}
            initialMessages={(history ?? []).map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm space-y-2">
            <p className="font-medium">Rådgivaren behöver en Anthropic-nyckel (sk-ant-…)</p>
            <p className="text-muted-foreground">
              Hämta en på <strong>console.anthropic.com</strong> och klistra in den under{" "}
              <strong>Inställningar → Bolagstyp &amp; AI-bokföraren</strong>. Rådgivaren
              använder verktyg för att läsa din bokföring, vilket kräver Claude.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

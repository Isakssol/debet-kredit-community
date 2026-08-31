"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveAiConfig, callAi, extractJson, type AiFile } from "@/lib/ai/provider";
import {
  buildSystemPrompt, validateSuggestion,
  type AiSuggestion, type CompanyType, type PromptContext,
} from "@/lib/ai/bookkeeper";
import { standardRules } from "@/lib/ai/standard-rules";

/** Max AI-anrop per körning — skyddar användarens API-kostnad */
const BATCH_CAP = 10;

async function loadAiContext() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: accounts }, { data: rules }, { data: settings }, { data: recent }] =
    await Promise.all([
      supabase.from("accounts").select("number, name, description")
        .eq("active", true).eq("blocked", false).order("number"),
      supabase.from("rule_values").select("key, value")
        .lte("valid_from", today).or(`valid_to.gte.${today},valid_to.is.null`),
      supabase.from("settings")
        .select("company_name, company_type, ai_api_key, ai_model, ai_rules")
        .eq("id", 1).single(),
      supabase.from("verifications")
        .select("number, verification_date, description, counterparty, verification_series(code)")
        .is("corrected_by_id", null)
        .order("verification_date", { ascending: false }).limit(30),
    ]);
  const companyType = (settings?.company_type as CompanyType) ?? "enskild_firma";
  const promptCtx: PromptContext = {
    companyType,
    companyName: settings?.company_name ?? "företaget",
    customRules: settings?.ai_rules?.trim() || standardRules(companyType),
    recentVerifications: (recent ?? []).map((v) => ({
      label: `${(v.verification_series as unknown as { code: string })?.code ?? ""}${v.number}`,
      date: v.verification_date,
      description: v.description,
      counterparty: v.counterparty,
    })),
  };
  return {
    supabase, today,
    accounts: accounts ?? [],
    ruleValues: Object.fromEntries((rules ?? []).map((r) => [r.key, Number(r.value)])),
    aiConfig: resolveAiConfig(settings?.ai_api_key, settings?.ai_model),
    promptCtx,
  };
}

export type GenerateResult = { ok?: boolean; error?: string; created?: number; skipped?: number };

/**
 * Generera AI-förslag för ohanterade banktransaktioner utan regelträff och
 * utan väntande förslag. Kapas till BATCH_CAP anrop per körning.
 */
export async function generateBankSuggestions(): Promise<GenerateResult> {
  const { supabase, today, accounts, ruleValues, aiConfig, promptCtx } = await loadAiContext();
  if (!aiConfig) return { error: "Ingen AI-nyckel — lägg in en under Inställningar → AI-bokföraren." };

  const [{ data: txs }, { data: pending }] = await Promise.all([
    supabase.from("bank_transactions")
      .select("id, booking_date, amount, description, counterpart")
      .eq("status", "unmatched").order("booking_date").limit(100),
    supabase.from("suggestion_queue").select("bank_transaction_id").eq("status", "pending"),
  ]);
  const hasPending = new Set((pending ?? []).map((p) => p.bank_transaction_id));
  const candidates = (txs ?? []).filter((t) => !hasPending.has(t.id)).slice(0, BATCH_CAP);
  if (!candidates.length) return { ok: true, created: 0, skipped: 0 };

  const systemPrompt = buildSystemPrompt(accounts, ruleValues, today, promptCtx);
  const validAccounts = new Set(accounts.map((a) => a.number));
  let created = 0, skipped = 0;

  for (const tx of candidates) {
    const dir = Number(tx.amount) < 0 ? "UTBETALNING" : "INSÄTTNING";
    const userPrompt =
      `Föreslå kontering för denna BANKTRANSAKTION (${dir} på företagskontot 1930 — ` +
      `likvidraden ska gå mot 1930, inte 2018):\n` +
      `Datum: ${tx.booking_date}\nBelopp: ${Math.abs(Number(tx.amount)).toFixed(2)} kr\n` +
      `Text: ${tx.description}\nMotpart: ${tx.counterpart ?? "okänd"}\n` +
      `Svara endast med JSON enligt formatet.`;
    try {
      const response = await callAi(aiConfig, systemPrompt, userPrompt);
      const validated = validateSuggestion(extractJson(response), validAccounts);
      if (!validated.ok) { skipped++; continue; }
      const { error } = await supabase.from("suggestion_queue").insert({
        source: "bank_tx",
        bank_transaction_id: tx.id,
        suggestion: validated.suggestion,
      });
      if (error) skipped++; else created++;
    } catch { skipped++; }
  }
  revalidatePath("/godkann");
  return { ok: true, created, skipped };
}

/** Generera AI-förslag för okopplade filer i underlagsinkorgen */
export async function generateInboxSuggestions(): Promise<GenerateResult> {
  const { supabase, today, accounts, ruleValues, aiConfig, promptCtx } = await loadAiContext();
  if (!aiConfig) return { error: "Ingen AI-nyckel — lägg in en under Inställningar → AI-bokföraren." };

  const [{ data: atts }, { data: pending }] = await Promise.all([
    supabase.from("attachments")
      .select("id, storage_path, file_name, mime_type")
      .is("verification_id", null).order("uploaded_at").limit(50),
    supabase.from("suggestion_queue").select("attachment_id").eq("status", "pending"),
  ]);
  const hasPending = new Set((pending ?? []).map((p) => p.attachment_id));
  const candidates = (atts ?? []).filter((a) => !hasPending.has(a.id)).slice(0, BATCH_CAP);
  if (!candidates.length) return { ok: true, created: 0, skipped: 0 };

  const systemPrompt = buildSystemPrompt(accounts, ruleValues, today, promptCtx);
  const validAccounts = new Set(accounts.map((a) => a.number));
  let created = 0, skipped = 0;

  for (const att of candidates) {
    try {
      const { data: blob } = await supabase.storage.from("underlag").download(att.storage_path);
      if (!blob) { skipped++; continue; }
      const aiFile: AiFile = {
        base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
        mimeType: att.mime_type ?? "image/jpeg",
      };
      const response = await callAi(
        aiConfig, systemPrompt,
        "Analysera det bifogade kvittot/fakturan och föreslå kontering. Svara endast med JSON enligt formatet.",
        aiFile
      );
      const validated = validateSuggestion(extractJson(response), validAccounts);
      if (!validated.ok) { skipped++; continue; }
      const { error } = await supabase.from("suggestion_queue").insert({
        source: "inbox_attachment",
        attachment_id: att.id,
        suggestion: validated.suggestion,
      });
      if (error) skipped++; else created++;
    } catch { skipped++; }
  }
  revalidatePath("/godkann");
  return { ok: true, created, skipped };
}

/** Godkänn ett förslag: bokför + koppla underlag/banktransaktion */
export async function approveSuggestion(id: string): Promise<{ ok?: boolean; error?: string; label?: string }> {
  const supabase = await createClient();
  const { data: item } = await supabase.from("suggestion_queue")
    .select("*").eq("id", id).eq("status", "pending").single();
  if (!item) return { error: "Förslaget finns inte eller är redan hanterat." };

  const { data: accounts } = await supabase.from("accounts")
    .select("number").eq("active", true).eq("blocked", false);
  const validated = validateSuggestion(item.suggestion, new Set((accounts ?? []).map((a) => a.number)));
  if (!validated.ok) return { error: validated.error };
  const s: AiSuggestion = validated.suggestion;

  const { data, error } = await supabase.rpc("book_verification", {
    p_series_code: "A",
    p_date: s.datum,
    p_description: s.beskrivning,
    p_rows: s.rader.map((r) => ({
      account: r.account, debit: r.debit, credit: r.credit, note: r.motivering,
    })),
    p_counterparty: s.motpart || undefined,
    p_source: "quick_event",
  });
  if (error) return { error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  const verificationId = result?.out_id as string;

  if (item.attachment_id) {
    await supabase.from("attachments")
      .update({ verification_id: verificationId })
      .eq("id", item.attachment_id).is("verification_id", null);
  }
  if (item.bank_transaction_id) {
    await supabase.from("bank_transactions")
      .update({ status: "booked", verification_id: verificationId })
      .eq("id", item.bank_transaction_id);
  }
  await supabase.from("suggestion_queue")
    .update({ status: "approved", verification_id: verificationId }).eq("id", id);

  revalidatePath("/", "layout");
  return { ok: true, label: `${result?.out_series}${result?.out_number}` };
}

/** Avvisa ett förslag (transaktionen/filen blir kvar för manuell hantering) */
export async function dismissSuggestion(id: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("suggestion_queue")
    .update({ status: "dismissed" }).eq("id", id).eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath("/godkann");
  return { ok: true };
}

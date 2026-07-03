"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, callAi, extractJson, type AiFile } from "@/lib/ai/provider";
import {
  buildSystemPrompt, validateSuggestion, type AiSuggestion,
} from "@/lib/ai/bookkeeper";

export type AnalyzeResult =
  | { ok: true; suggestion: AiSuggestion; provider: string }
  | { error: string };

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

async function loadContext() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: accounts }, { data: rules }] = await Promise.all([
    supabase.from("accounts").select("number, name, description")
      .eq("active", true).eq("blocked", false).order("number"),
    supabase.from("rule_values").select("key, value")
      .lte("valid_from", today).or(`valid_to.gte.${today},valid_to.is.null`),
  ]);
  return {
    supabase,
    today,
    accounts: accounts ?? [],
    rules: Object.fromEntries((rules ?? []).map((r) => [r.key, Number(r.value)])),
  };
}

/** Analysera ett inköp: kvitto/faktura (bild eller PDF) och/eller textbeskrivning */
export async function analyzePurchase(formData: FormData): Promise<AnalyzeResult> {
  if (!aiConfigured()) {
    return {
      error: "Ingen AI-nyckel konfigurerad. Lägg in ANTHROPIC_API_KEY (rekommenderas, " +
        "läser även PDF) eller OPENAI_API_KEY i .env.local och starta om appen.",
    };
  }

  const file = formData.get("file") as File | null;
  const text = (formData.get("text") as string | null)?.trim() || null;
  const inboxAttachmentId = (formData.get("inboxAttachmentId") as string | null) || null;

  const { supabase, today, accounts, rules } = await loadContext();

  let aiFile: AiFile | undefined;
  if (inboxAttachmentId) {
    // Analysera fil som redan ligger i underlagsinkorgen
    const { data: att } = await supabase.from("attachments")
      .select("storage_path, mime_type").eq("id", inboxAttachmentId).single();
    if (!att) return { error: "Filen finns inte i inkorgen." };
    const { data: blob } = await supabase.storage.from("underlag").download(att.storage_path);
    if (!blob) return { error: "Kunde inte läsa filen från lagringen." };
    aiFile = {
      base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
      mimeType: att.mime_type ?? "image/jpeg",
    };
  } else if (file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { error: "Filen är för stor (max 8 MB)." };
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { error: `Filtypen ${file.type} stöds inte — använd JPG, PNG, WebP eller PDF.` };
    }
    aiFile = {
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mimeType: file.type,
    };
  }

  if (!aiFile && !text) return { error: "Ladda upp ett kvitto eller beskriv inköpet." };

  const userPrompt = [
    aiFile ? "Analysera det bifogade kvittot/fakturan och föreslå kontering." : null,
    text ? `Användarens beskrivning: ${text}` : null,
    "Svara endast med JSON enligt formatet.",
  ].filter(Boolean).join("\n");

  try {
    const response = await callAi(
      buildSystemPrompt(accounts, rules, today),
      userPrompt,
      aiFile
    );
    const raw = extractJson(response);
    const validated = validateSuggestion(raw, new Set(accounts.map((a) => a.number)));
    if (!validated.ok) return { error: `AI-förslaget underkändes: ${validated.error}` };
    return {
      ok: true,
      suggestion: validated.suggestion,
      provider: aiConfigured()!.provider === "anthropic" ? "Claude" : "OpenAI",
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Bokför det granskade AI-förslaget + arkivera underlaget på verifikatet */
export async function bookAiSuggestion(formData: FormData): Promise<{
  ok?: boolean; error?: string; verificationId?: string; label?: string;
}> {
  const payload = formData.get("suggestion") as string | null;
  if (!payload) return { error: "Inget förslag att bokföra." };
  let suggestion: AiSuggestion;
  try {
    suggestion = JSON.parse(payload);
  } catch {
    return { error: "Ogiltigt förslag." };
  }

  const { supabase, accounts } = await loadContext();
  const validated = validateSuggestion(suggestion, new Set(accounts.map((a) => a.number)));
  if (!validated.ok) return { error: validated.error };
  const s = validated.suggestion;

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

  // Arkivera underlaget: ny fil eller koppla inkorgsfil
  const file = formData.get("file") as File | null;
  const inboxAttachmentId = (formData.get("inboxAttachmentId") as string | null) || null;
  if (inboxAttachmentId) {
    await supabase.from("attachments")
      .update({ verification_id: verificationId })
      .eq("id", inboxAttachmentId).is("verification_id", null);
  } else if (file && file.size > 0) {
    const path = `${new Date().getFullYear()}/${verificationId}/${file.name}`;
    const { error: upErr } = await supabase.storage.from("underlag")
      .upload(path, file, { contentType: file.type });
    if (!upErr) {
      await supabase.from("attachments").insert({
        verification_id: verificationId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
      });
    }
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    verificationId,
    label: `${result?.out_series}${result?.out_number}`,
  };
}

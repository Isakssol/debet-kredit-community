"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCustomersCsv, parseArticlesCsv } from "@/lib/migration/csv";
import { fetchAll } from "@/lib/supabase/fetch-all";

const MAX_CSV_BYTES = 2 * 1024 * 1024;

// Dubblettnyckel: orgnr (bara siffror) när det finns, annars normaliserat namn.
// Samma nyckel för befintliga rader och CSV-rader — annars skapas dubbletter
// när t.ex. Fortnox skriver orgnr med bindestreck men namnet stavas olika.
const key = (name: string, org: string | null) => (org ?? "").replace(/\D/g, "") || name.toLowerCase().trim();

/** Importera kundregister från CSV (Fortnox/Visma-export). Dubbletter på orgnr/namn hoppas över. */
export async function importCustomersCsv(formData: FormData): Promise<{
  ok?: boolean; error?: string; imported?: number; skipped?: number;
}> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Ingen fil vald." };
  if (file.size > MAX_CSV_BYTES) return { error: "Filen är för stor (max 2 MB)." };

  const { customers, error } = parseCustomersCsv(Buffer.from(await file.arrayBuffer()).toString("utf-8"));
  if (error) return { error };
  if (!customers.length) return { error: "Inga kunder hittades i filen." };

  const supabase = await createClient();
  // fetchAll: register med över 1000 poster ska också dubblettskyddas
  const existing = await fetchAll<{ name: string; org_number: string | null }>((f, t) =>
    supabase.from("customers").select("name, org_number").order("id").range(f, t));
  const seen = new Set(existing.map((c) => key(c.name, c.org_number)));

  let imported = 0, skipped = 0;
  for (const c of customers) {
    const k = key(c.name, c.org_number);
    if (seen.has(k)) { skipped++; continue; }
    const { error: insErr } = await supabase.from("customers").insert(c);
    if (insErr) skipped++;
    else { imported++; seen.add(k); }
  }
  revalidatePath("/kunder");
  return { ok: true, imported, skipped };
}

/** Importera artikelregister från CSV. Försäljningskonto sätts till standardkontot för tjänster. */
export async function importArticlesCsv(formData: FormData): Promise<{
  ok?: boolean; error?: string; imported?: number; skipped?: number;
}> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Ingen fil vald." };
  if (file.size > MAX_CSV_BYTES) return { error: "Filen är för stor (max 2 MB)." };

  const { articles, error } = parseArticlesCsv(Buffer.from(await file.arrayBuffer()).toString("utf-8"));
  if (error) return { error };
  if (!articles.length) return { error: "Inga artiklar hittades i filen." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("articles").select("article_no");
  const existingNos = new Set((existing ?? []).map((a) => a.article_no.toLowerCase()));

  let imported = 0, skipped = 0;
  for (const a of articles) {
    if (existingNos.has(a.article_no.toLowerCase())) { skipped++; continue; }
    const { error: insErr } = await supabase.from("articles").insert({
      ...a,
      vat_rate: [0, 6, 12, 25].includes(a.vat_rate) ? a.vat_rate : 25,
      sales_account: 3011,
      type: "service",
    });
    if (insErr) skipped++;
    else { imported++; existingNos.add(a.article_no.toLowerCase()); }
  }
  revalidatePath("/artiklar");
  return { ok: true, imported, skipped };
}

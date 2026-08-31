"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCustomersCsv, parseArticlesCsv } from "@/lib/migration/csv";

const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** Importera kundregister från CSV (Fortnox/Visma-export). Dubbletter på namn hoppas över. */
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
  const { data: existing } = await supabase.from("customers").select("name");
  const existingNames = new Set((existing ?? []).map((c) => c.name.toLowerCase().trim()));

  let imported = 0, skipped = 0;
  for (const c of customers) {
    if (existingNames.has(c.name.toLowerCase().trim())) { skipped++; continue; }
    const { error: insErr } = await supabase.from("customers").insert(c);
    if (insErr) skipped++;
    else { imported++; existingNames.add(c.name.toLowerCase().trim()); }
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

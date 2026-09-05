"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { toKronor2, toOre } from "@/lib/money";

const rowSchema = z.object({
  account: z.number().int().min(1000).max(8999),
  debit: z.number().min(0),
  credit: z.number().min(0),
  note: z.string().optional(),
});

const bookSchema = z.object({
  seriesCode: z.string().min(1).max(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  counterparty: z.string().optional(),
  source: z.string().default("manual"),
  rows: z.array(rowSchema).min(2),
});

export type BookVerificationInput = z.infer<typeof bookSchema>;

export async function bookVerification(input: BookVerificationInput) {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Ogiltiga uppgifter: " + parsed.error.issues[0].message };
  }
  const { seriesCode, date, description, counterparty, source } = parsed.data;

  // Bokföringen förs i ören. Raderna avrundas HÄR, med samma exakta
  // decimalavrundning som databasens numeric(12,2), och det avrundade beloppet
  // är både det som balanskontrolleras och det som skickas vidare. Förut räknade
  // förkontrollen med binära flyttal (Math.round(1.005 * 100) = 100) medan
  // motorn räknade 1,005 → 1,01: appen kunde säga "balanserar" om ett verifikat
  // som motorn sedan avvisade, och användaren fick ett kryptiskt motorfel på
  // något gränssnittet just godkänt.
  const rows = parsed.data.rows.map((r) => ({
    ...r,
    debit: toKronor2(r.debit),
    credit: toKronor2(r.credit),
  }));
  const totalDebit = rows.reduce((s, r) => s + toOre(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + toOre(r.credit), 0);
  if (totalDebit !== totalCredit) {
    return { error: "Verifikatet balanserar inte." };
  }
  /**
   * Motorn har TVÅ invarianter efter summeringen, inte en: debet = kredit OCH
   * ett belopp skilt från noll ("Verifikatet saknar belopp." i book_verification
   * och i verification_assert_balance). Förkontrollen speglade bara den första,
   * och rowSchema tillåter debit/credit = 0 — så två nollrader, eller belopp
   * under ett halvt öre som toKronor2 rundar till noll, passerade här och
   * avvisades sedan av motorn med exakt det kryptiska motorfel förkontrollen
   * finns till för att undvika. En bokföringspost utan belopp är ingen
   * affärshändelse [BFL (1999:1078) 4 kap. 1 §].
   */
  if (totalDebit === 0) {
    return {
      error: "Verifikatet saknar belopp — alla rader är noll. Ange beloppen, "
        + "eller ta bort verifikatet om ingen affärshändelse har inträffat.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_verification", {
    p_series_code: seriesCode,
    p_date: date,
    p_description: description,
    p_rows: rows,
    p_counterparty: counterparty ?? undefined,
    p_source: source,
  });

  if (error) return { error: error.message };
  revalidatePath("/verifikat");
  revalidatePath("/");
  const result = Array.isArray(data) ? data[0] : data;
  return {
    verificationId: result?.out_id as string,
    label: `${result?.out_series}${result?.out_number}`,
  };
}

export async function correctVerification(input: {
  originalId: string;
  date: string;
  description: string;
  rows: z.infer<typeof rowSchema>[] | null;
  reason: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_verification", {
    p_original: input.originalId,
    p_new_date: input.date,
    p_new_description: input.description,
    p_new_rows: input.rows,
    p_reason: input.reason,
  });
  if (error) return { error: error.message };
  revalidatePath("/verifikat");
  return { ok: true, data };
}

export async function attachFile(verificationId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Ingen fil." };
  const supabase = await createClient();
  const path = `${new Date().getFullYear()}/${verificationId}/${file.name}`;
  const { error: upErr } = await supabase.storage
    .from("underlag")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr.message };
  const { error } = await supabase.from("attachments").insert({
    verification_id: verificationId,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
  });
  if (error) return { error: error.message };
  revalidatePath(`/verifikat/${verificationId}`);
  return { ok: true };
}

export async function lockPeriod(fiscalYearId: string, month: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("period_locks").insert({
    fiscal_year_id: fiscalYearId,
    month,
    reason: "manual",
  });
  if (error) return { error: error.message };
  revalidatePath("/installningar");
  return { ok: true };
}

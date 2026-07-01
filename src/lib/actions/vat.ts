"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeVatBoxes, vatClosingRows, generateEskd, type VatEntry } from "@/lib/vat/report";

export async function getVatEntries(periodStart: string, periodEnd: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ledger_entries")
    .select("account, debit, credit")
    .gte("verification_date", periodStart)
    .lte("verification_date", periodEnd);
  const { data: accounts } = await supabase.from("accounts").select("number, vat_code");
  const vatCodeByAccount = new Map((accounts ?? []).map((a) => [a.number, a.vat_code]));
  return (data ?? []).map((e) => ({
    account: e.account!,
    vat_code: vatCodeByAccount.get(e.account!) ?? null,
    debit: Number(e.debit),
    credit: Number(e.credit),
  })) as VatEntry[];
}

/** Godkänn momsrapport: skapa omföringsverifikat, lås perioden, spara eSKD. */
export async function approveVatReport(input: {
  periodStart: string;
  periodEnd: string;
}) {
  const supabase = await createClient();

  const [{ data: fy }, { data: settings }, { data: existing }] = await Promise.all([
    supabase.from("fiscal_years").select("*")
      .lte("start_date", input.periodStart).gte("end_date", input.periodEnd).single(),
    supabase.from("settings").select("org_number").eq("id", 1).single(),
    supabase.from("vat_reports").select("id, status")
      .eq("period_start", input.periodStart).maybeSingle(),
  ]);
  if (!fy) return { error: "Perioden matchar inget räkenskapsår." };
  if (existing?.status === "approved") return { error: "Perioden är redan momsredovisad." };
  if (!settings?.org_number) {
    return { error: "Ange personnummer under Inställningar först (krävs i eSKD-filen)." };
  }

  const entries = await getVatEntries(input.periodStart, input.periodEnd);
  const { boxes, exact } = computeVatBoxes(entries);
  const closingRows = vatClosingRows(exact);

  let verificationId: string | null = null;
  if (closingRows.length > 0) {
    const { data: ver, error: verErr } = await supabase.rpc("book_verification", {
      p_series_code: "D",
      p_date: input.periodEnd,
      p_description: `Momsredovisning ${input.periodStart} – ${input.periodEnd}`,
      p_rows: closingRows,
      p_source: "vat_report",
    });
    if (verErr) return { error: verErr.message };
    verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;
  }

  const eskd = generateEskd(settings.org_number, input.periodEnd, boxes);

  const reportValues = {
    fiscal_year_id: fy.id,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    status: "approved" as const,
    boxes,
    verification_id: verificationId,
    eskd_xml: eskd,
    approved_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from("vat_reports").update(reportValues).eq("id", existing.id)
    : await supabase.from("vat_reports").insert(reportValues);
  if (error) return { error: error.message };

  // Lås periodens månader
  const startMonth = parseInt(input.periodStart.slice(5, 7));
  const endMonth = parseInt(input.periodEnd.slice(5, 7));
  for (let m = startMonth; m <= endMonth; m++) {
    await supabase.from("period_locks")
      .upsert({ fiscal_year_id: fy.id, month: m, reason: "vat_report" },
              { onConflict: "fiscal_year_id,month" });
  }

  revalidatePath("/moms");
  return { ok: true, boxes };
}

/**
 * Bokför momsbetalning/återbetalning (via 1930). Deklarationen är i hela kronor
 * men 2650-saldot är exakt — öresdiffen bokförs på 3740.
 */
export async function payVat(input: { date: string; amount: number }) {
  const supabase = await createClient();

  const { data: saldoRows } = await supabase.from("ledger_entries")
    .select("debit, credit").eq("account", 2650);
  const exactBalance = (saldoRows ?? [])
    .reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0); // negativt = skuld
  const clear = Math.round(-exactBalance * 100) / 100; // positivt = skuld att nollställa
  const diff = Math.round((input.amount - clear) * 100) / 100;

  const rows: { account: number; debit: number; credit: number; note?: string }[] = [];
  if (input.amount > 0) {
    rows.push({ account: 2650, debit: clear, credit: 0, note: "Momsskuld nollställs" });
    if (diff > 0) rows.push({ account: 3740, debit: diff, credit: 0, note: "Öresavrundning deklaration" });
    if (diff < 0) rows.push({ account: 3740, debit: 0, credit: -diff, note: "Öresavrundning deklaration" });
    rows.push({ account: 1930, debit: 0, credit: input.amount });
  } else {
    rows.push({ account: 1930, debit: -input.amount, credit: 0 });
    rows.push({ account: 2650, debit: 0, credit: -clear, note: "Momsfordran nollställs" });
    const rdiff = Math.round((-input.amount - -clear) * 100) / 100;
    if (rdiff > 0) rows.push({ account: 3740, debit: 0, credit: rdiff, note: "Öresavrundning deklaration" });
    if (rdiff < 0) rows.push({ account: 3740, debit: -rdiff, credit: 0, note: "Öresavrundning deklaration" });
  }
  const { error } = await supabase.rpc("book_verification", {
    p_series_code: "D",
    p_date: input.date,
    p_description: input.amount > 0 ? "Momsbetalning till Skatteverket" : "Momsåterbetalning från Skatteverket",
    p_rows: rows,
    p_counterparty: "Skatteverket",
    p_source: "vat_report",
  });
  if (error) return { error: error.message };
  revalidatePath("/moms");
  return { ok: true };
}

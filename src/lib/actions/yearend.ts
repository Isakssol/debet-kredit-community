"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const EQUITY_SUBACCOUNTS = [2011, 2012, 2013, 2018, 2019];

export type YearEndChecklist = {
  allMonthsLocked: boolean;
  vatApproved: boolean;
  arMatches: boolean;      // 1510 = öppna kundfakturor
  apMatches: boolean;      // 2440 = öppna leverantörsfakturor
  missingAttachments: number;
  depreciationDone: boolean;
};

export async function getYearEndChecklist(fiscalYearId: string, year: number): Promise<YearEndChecklist> {
  const supabase = await createClient();
  const [
    { data: locks }, { data: vatReports }, { data: balances },
    { data: openInvoices }, { data: openSupplier }, { data: noAttach },
    { data: deps }, { data: settings },
  ] = await Promise.all([
    supabase.from("period_locks").select("month").eq("fiscal_year_id", fiscalYearId),
    supabase.from("vat_reports").select("period_start, status").eq("fiscal_year_id", fiscalYearId),
    supabase.from("account_balances").select("*").eq("fiscal_year_id", fiscalYearId),
    supabase.from("invoices").select("total_amount, invoice_payments(amount)")
      .in("status", ["booked", "sent", "partially_paid"]).eq("type", "debit"),
    supabase.from("supplier_invoices").select("total_amount, supplier_payments(amount)")
      .neq("status", "paid"),
    supabase.from("verifications").select("id, attachments(id)")
      .eq("fiscal_year_id", fiscalYearId)
      .in("source", ["manual", "quick_event", "supplier_invoice"]),
    supabase.from("asset_depreciations").select("id").eq("fiscal_year_id", fiscalYearId).limit(1),
    supabase.from("settings").select("vat_period, eu_trade").eq("id", 1).single(),
  ]);

  const bal = balances ?? [];
  const saldo = (acc: number) =>
    bal.filter((b) => b.account === acc).reduce((s, b) => s + Number(b.balance), 0);

  const arOpen = (openInvoices ?? []).reduce((s, i) => {
    const paid = ((i.invoice_payments ?? []) as { amount: number }[])
      .reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(i.total_amount) - paid;
  }, 0);
  const apOpen = (openSupplier ?? []).reduce((s, i) => {
    const paid = ((i.supplier_payments ?? []) as { amount: number }[])
      .reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(i.total_amount) - paid;
  }, 0);

  // Alla momsperioder för året godkända?
  const { vatPeriods } = await import("@/lib/vat/report");
  const periods = vatPeriods(
    year,
    (settings?.vat_period ?? "kvartal") as "manad" | "kvartal" | "helar",
    settings?.eu_trade ?? false
  );
  const vatApproved = periods.every((p) =>
    (vatReports ?? []).some((r) => r.period_start === p.start && r.status === "approved"));

  const { data: assets } = await supabase.from("assets").select("id").eq("status", "active").limit(1);

  return {
    allMonthsLocked: new Set((locks ?? []).map((l) => l.month)).size === 12,
    vatApproved,
    arMatches: Math.abs(saldo(1510) - arOpen) < 0.01,
    apMatches: Math.abs(-saldo(2440) - apOpen) < 0.01,
    missingAttachments: (noAttach ?? []).filter((v) =>
      !(v.attachments as { id: string }[])?.length).length,
    depreciationDone: !assets?.length || !!(deps ?? []).length,
  };
}

/**
 * Slutför årsavslutet:
 * 1. Bokför årets resultat: 8999 ↔ 2019
 * 2. Skapar nästa räkenskapsår + serier
 * 3. Bokför ingående balanser i nya året (EK-underkonton konsolideras till 2010)
 * 4. Stänger året
 */
export async function completeYearEnd(year: number) {
  const supabase = await createClient();
  const { data: fy } = await supabase.from("fiscal_years").select("*").eq("year", year).single();
  if (!fy) return { error: "Räkenskapsåret finns inte." };
  if (fy.status === "closed") return { error: "Året är redan avslutat." };

  const { data: balances } = await supabase.from("account_balances").select("*")
    .eq("fiscal_year_id", fy.id);
  const bal = balances ?? [];

  // Bokslutsposten ska gå att hitta från bokslutsraden och inte bara genom att
  // leta på source = 'year_end' (BFL 5 kap. 6 §: verifikationen och det den
  // avser ska gå att knyta ihop). Egetkapitalkonsolideringen ligger i den här
  // utgåvan inne i IB-verifikatet och har därför ingen egen rad att peka på.
  let resultVerificationId: string | null = null;

  // 1. Årets resultat (klass 3–8 exkl. 8999)
  const result = bal.filter((b) => b.class! >= 3 && b.account !== 8999)
    .reduce((s, b) => s - Number(b.balance), 0);
  if (Math.abs(result) >= 0.005) {
    const rows = result > 0
      ? [{ account: 8999, debit: result, credit: 0 },
         { account: 2019, debit: 0, credit: result }]
      : [{ account: 2019, debit: -result, credit: 0 },
         { account: 8999, debit: 0, credit: -result }];
    const { data: ver, error } = await supabase.rpc("book_verification", {
      p_series_code: "E",
      p_date: fy.end_date,
      p_description: `Årets resultat ${year}`,
      p_rows: rows,
      p_source: "year_end",
    });
    if (error) return { error: error.message };
    resultVerificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;
  }

  // 2. Nästa räkenskapsår
  const nextYear = year + 1;
  const { data: existingNext } = await supabase.from("fiscal_years")
    .select("id").eq("year", nextYear).maybeSingle();
  let nextFyId = existingNext?.id;
  if (!nextFyId) {
    const { data: created, error } = await supabase.from("fiscal_years").insert({
      year: nextYear,
      start_date: `${nextYear}-01-01`,
      end_date: `${nextYear}-12-31`,
      accounting_method: fy.accounting_method,
    }).select("id").single();
    if (error) return { error: error.message };
    nextFyId = created.id;
    const series = [
      { code: "A", name: "Manuella verifikat", manual: true },
      { code: "B", name: "Kundfakturor", manual: false },
      { code: "C", name: "Leverantörsfakturor", manual: false },
      { code: "D", name: "Moms och omföringar", manual: false },
      { code: "E", name: "Bokslut", manual: false },
    ];
    for (const s of series) {
      await supabase.from("verification_series").insert({
        fiscal_year_id: nextFyId, code: s.code, name: s.name, manual_entry: s.manual,
      });
    }
  }

  // 3. Ingående balanser i nya året (hämta färska saldon inkl. resultatbokningen)
  const { data: freshBalances } = await supabase.from("account_balances").select("*")
    .eq("fiscal_year_id", fy.id);
  const ibRows: { account: number; debit: number; credit: number; note?: string }[] = [];
  let equityTotal = 0;
  for (const b of freshBalances ?? []) {
    if (b.class! > 2) continue;
    const balance = Number(b.balance);
    if (Math.abs(balance) < 0.005) continue;
    if (b.account === 2010 || EQUITY_SUBACCOUNTS.includes(b.account!)) {
      equityTotal += balance;
      continue;
    }
    ibRows.push(balance > 0
      ? { account: b.account!, debit: balance, credit: 0 }
      : { account: b.account!, debit: 0, credit: -balance });
  }
  if (Math.abs(equityTotal) >= 0.005) {
    ibRows.push(equityTotal > 0
      ? { account: 2010, debit: equityTotal, credit: 0, note: "Eget kapital konsoliderat" }
      : { account: 2010, debit: 0, credit: -equityTotal, note: "Eget kapital konsoliderat" });
  }
  if (ibRows.length >= 2) {
    const { error } = await supabase.rpc("book_verification", {
      p_series_code: "A",
      p_date: `${nextYear}-01-01`,
      p_description: `Ingående balanser ${nextYear}`,
      p_rows: ibRows,
      p_source: "opening_balance",
    });
    if (error) return { error: `IB-bokningen misslyckades: ${error.message}` };
  }

  // 4. Stäng året
  const { error: closeErr } = await supabase.from("fiscal_years")
    .update({ status: "closed" }).eq("id", fy.id);
  if (closeErr) return { error: closeErr.message };
  await supabase.from("fiscal_years").update({ ib_booked: true }).eq("id", nextFyId!);

  await supabase.from("year_end_closings").upsert({
    fiscal_year_id: fy.id,
    status: "completed",
    result_verification_id: resultVerificationId,
    completed_at: new Date().toISOString(),
  }, { onConflict: "fiscal_year_id" });

  revalidatePath("/", "layout");
  return { ok: true, result: Math.round(result), nextYear };
}

/** Spara deklarationsposter (periodiseringsfond m.m.) för NE-bilagan */
export async function saveTaxAllocations(input: {
  year: number;
  periodiseringsfond: number;
  rantefordelning: number;
}) {
  const supabase = await createClient();
  if (input.periodiseringsfond > 0) {
    await supabase.from("tax_allocation_reserves").upsert({
      tax_year: input.year,
      amount: input.periodiseringsfond,
    }, { onConflict: "tax_year" });
  }
  if (input.rantefordelning !== 0) {
    await supabase.from("tax_carryforwards").upsert({
      key: "rantefordelning_utnyttjad",
      tax_year: input.year,
      amount: input.rantefordelning,
    }, { onConflict: "key,tax_year" });
  }
  revalidatePath("/arsavslut");
  return { ok: true };
}

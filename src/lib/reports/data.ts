import { createClient } from "@/lib/supabase/server";

export type ReportContext = {
  companyName: string;
  orgNumber: string;
  fiscalYear: { id: string; year: number; start: string; end: string };
  printedAt: string;
  lastVerNo: string;
};

export async function getReportContext(year?: number): Promise<ReportContext | { error: string }> {
  const supabase = await createClient();
  const [{ data: settings }, fyRes] = await Promise.all([
    supabase.from("settings").select("company_name, org_number").eq("id", 1).single(),
    year
      ? supabase.from("fiscal_years").select("*").eq("year", year).single()
      : supabase.from("fiscal_years").select("*").eq("status", "open")
          .order("year", { ascending: false }).limit(1).single(),
  ]);
  const fy = fyRes.data;
  if (!fy) return { error: "Räkenskapsår saknas." };

  const { data: series } = await supabase
    .from("verification_series")
    .select("code, next_number")
    .eq("fiscal_year_id", fy.id)
    .order("code");
  const lastVerNo = (series ?? [])
    .filter((s) => s.next_number > 1)
    .map((s) => `${s.code} ${s.next_number - 1}`)
    .join("  ");

  return {
    companyName: settings?.company_name ?? "trimtech",
    orgNumber: settings?.org_number ?? "—",
    fiscalYear: { id: fy.id, year: fy.year, start: fy.start_date, end: fy.end_date },
    printedAt: new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }),
    lastVerNo,
  };
}

export type AccountLine = {
  account: number;
  name: string;
  class: number;
  opening: number;   // ingående balans (från IB-verifikat)
  period: number;    // periodens förändring
  closing: number;   // utgående saldo
};

/** Kontosaldon uppdelade i IB / period / UB — grunden för balans- och resultatrapporten */
export async function getAccountLines(
  fiscalYearId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<AccountLine[]> {
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("account, account_name, debit, credit, verification_date, verification_id")
    .eq("fiscal_year_id", fiscalYearId);
  const { data: obVers } = await supabase
    .from("verifications").select("id").eq("fiscal_year_id", fiscalYearId)
    .eq("source", "opening_balance");
  const obIds = new Set((obVers ?? []).map((v) => v.id));

  const map = new Map<number, AccountLine>();
  for (const e of entries ?? []) {
    const acc = e.account!;
    if (!map.has(acc)) {
      map.set(acc, {
        account: acc, name: e.account_name ?? "", class: Math.floor(acc / 1000),
        opening: 0, period: 0, closing: 0,
      });
    }
    const line = map.get(acc)!;
    const amount = Number(e.debit) - Number(e.credit);
    const isOpening = obIds.has(e.verification_id!);
    const inPeriod = (!periodStart || e.verification_date! >= periodStart)
      && (!periodEnd || e.verification_date! <= periodEnd);
    if (isOpening) line.opening += amount;
    else if (inPeriod) line.period += amount;
    line.closing += isOpening || inPeriod ? amount : 0;
    // Rörelser före periodstart (ej IB) räknas in i "opening" för periodrapporter
    if (!isOpening && periodStart && e.verification_date! < periodStart) {
      line.opening += amount;
      line.closing += amount;
    }
  }
  return [...map.values()].sort((a, b) => a.account - b.account);
}

export type LedgerRow = {
  account: number;
  accountName: string;
  date: string;
  ver: string;
  verificationId: string;
  description: string;
  debit: number;
  credit: number;
};

export async function getLedgerRows(fiscalYearId: string): Promise<LedgerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("fiscal_year_id", fiscalYearId)
    .order("account")
    .order("verification_date");
  return (data ?? []).map((e) => ({
    account: e.account!,
    accountName: e.account_name ?? "",
    date: e.verification_date!,
    ver: e.verification_label ?? "",
    verificationId: e.verification_id!,
    description: e.description ?? "",
    debit: Number(e.debit),
    credit: Number(e.credit),
  }));
}

import { createClient } from "@/lib/supabase/server";
import { generateSie4, type SieData } from "@/lib/sie/export";

/** Bygger komplett SIE 4E-fil för ett räkenskapsår ur databasen. */
export async function buildSieForYear(year: number): Promise<{ sie: string } | { error: string }> {
  const supabase = await createClient();

  const [{ data: settings }, { data: fy }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("fiscal_years").select("*").eq("year", year).single(),
  ]);
  if (!fy) return { error: `Räkenskapsår ${year} finns inte.` };
  if (!settings?.org_number) return { error: "Ange personnummer under Inställningar först." };

  const [{ data: accounts }, { data: verifications }, { data: balances }] = await Promise.all([
    supabase.from("accounts").select("number, name, sru_code").order("number"),
    supabase.from("verifications")
      .select("number, verification_date, registered_at, description, verification_series(code), verification_rows(account, debit, credit, note, row_no)")
      .eq("fiscal_year_id", fy.id)
      .order("verification_date"),
    supabase.from("account_balances").select("*").eq("fiscal_year_id", fy.id),
  ]);

  // Endast konton som används i året + hela kontoplanens namn
  const usedAccounts = new Set((balances ?? []).map((b) => b.account!));
  const accountList = (accounts ?? [])
    .filter((a) => usedAccounts.has(a.number))
    .map((a) => ({ number: a.number, name: a.name, sru: a.sru_code }));

  // IB = öppningsbalans-verifikat (source opening_balance); UB = totalsaldo; RES = resultatkonton
  const { data: obRows } = await supabase
    .from("verifications")
    .select("verification_rows(account, debit, credit)")
    .eq("fiscal_year_id", fy.id)
    .eq("source", "opening_balance");

  const ibMap = new Map<number, number>();
  for (const v of obRows ?? []) {
    for (const r of (v.verification_rows as { account: number; debit: number; credit: number }[]) ?? []) {
      ibMap.set(r.account, (ibMap.get(r.account) ?? 0) + Number(r.debit) - Number(r.credit));
    }
  }

  const openingBalances = [...ibMap.entries()]
    .filter(([acc, val]) => acc < 3000 && Math.abs(val) >= 0.005)
    .map(([account, amount]) => ({ account, amount }));

  const closingBalances = (balances ?? [])
    .filter((b) => b.class! <= 2 && Math.abs(Number(b.balance)) >= 0.005)
    .map((b) => ({ account: b.account!, amount: Number(b.balance) }));

  const results = (balances ?? [])
    .filter((b) => b.class! >= 3 && Math.abs(Number(b.balance)) >= 0.005)
    .map((b) => ({ account: b.account!, amount: Number(b.balance) }));

  const sieVerifications = (verifications ?? []).map((v) => ({
    series: (v.verification_series as unknown as { code: string })?.code ?? "A",
    number: v.number,
    date: v.verification_date,
    description: v.description,
    registeredDate: (v.registered_at as string).slice(0, 10),
    rows: ((v.verification_rows as { account: number; debit: number; credit: number; note: string | null; row_no: number }[]) ?? [])
      .sort((a, b) => a.row_no - b.row_no)
      .map((r) => ({
        account: r.account,
        amount: Number(r.debit) - Number(r.credit),
        note: r.note ?? undefined,
      })),
  }));

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const orgNr = settings.org_number.replace(/\s/g, "");

  const data: SieData = {
    companyName: settings.company_name,
    orgNumber: orgNr,
    generatedDate: today,
    fiscalYear: { year: fy.year, start: fy.start_date, end: fy.end_date },
    accounts: accountList,
    openingBalances,
    closingBalances,
    results,
    verifications: sieVerifications,
  };

  return { sie: generateSie4(data) };
}

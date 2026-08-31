/**
 * Regelmotor för banktransaktioner: matchar text mot aktiva regler och bygger
 * balanserade konteringsrader. Bokning sker endast vid ENTYDIG träff — matchar
 * flera regler samma transaktion lämnas den för manuell hantering.
 */

export type BankRule = {
  id: string;
  name: string;
  match_text: string;
  direction: "in" | "out" | "both";
  account: number;
  vat_rate: number;
  liquidity_account: number;
  auto_book: boolean;
};

export type RuleTx = {
  id: string;
  booking_date: string;
  amount: number;
  description: string;
  counterpart: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Momskonto för utgående moms per sats (försäljning) */
const OUTPUT_VAT_ACCOUNT: Record<number, number> = { 25: 2611, 12: 2621, 6: 2631 };

/** Alla regler som matchar en transaktion (text + riktning) */
export function matchingRules(tx: RuleTx, rules: BankRule[]): BankRule[] {
  const haystack = `${tx.description} ${tx.counterpart ?? ""}`.toLowerCase();
  const dir = tx.amount >= 0 ? "in" : "out";
  return rules.filter((r) =>
    (r.direction === "both" || r.direction === dir) &&
    r.match_text.trim() !== "" &&
    haystack.includes(r.match_text.trim().toLowerCase())
  );
}

/** Bygg balanserade konteringsrader för en regelträff */
export function buildRuleRows(
  tx: RuleTx,
  rule: BankRule
): { account: number; debit: number; credit: number }[] {
  const gross = round2(Math.abs(Number(tx.amount)));
  const vat = round2(gross * rule.vat_rate / (100 + rule.vat_rate));
  const net = round2(gross - vat);

  if (tx.amount < 0) {
    // Utgift: kostnad + ev. ingående moms, kredit likvidkonto
    const rows = [{ account: rule.account, debit: net, credit: 0 }];
    if (vat > 0) rows.push({ account: 2640, debit: vat, credit: 0 });
    rows.push({ account: rule.liquidity_account, debit: 0, credit: gross });
    return rows;
  }
  // Intäkt: debet likvidkonto, kredit intäkt + ev. utgående moms
  const rows = [{ account: rule.liquidity_account, debit: gross, credit: 0 }];
  rows.push({ account: rule.account, debit: 0, credit: net });
  if (vat > 0) rows.push({ account: OUTPUT_VAT_ACCOUNT[rule.vat_rate] ?? 2611, debit: 0, credit: vat });
  return rows;
}

export function ruleDescription(tx: RuleTx, rule: BankRule): string {
  return `${rule.name} — banktransaktion ${tx.booking_date}: ${tx.description}`.slice(0, 200);
}

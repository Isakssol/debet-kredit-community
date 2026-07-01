import { kronorToOre, oreToKronor, roundToKrona, vatOnNet } from "@/lib/money";

export type InvoiceRowInput = {
  description: string;
  quantity: number;
  unitPrice: number; // exkl. moms, kronor
  discountPct: number;
  vatRate: number; // 25 | 12 | 6 | 0
  account: number;
  isTextRow?: boolean;
};

export type VatGroup = { rate: number; net: number; vat: number };

export type InvoiceTotals = {
  net: number;
  vatGroups: VatGroup[]; // momsspecifikation per sats (lagkrav)
  vat: number;
  rounding: number; // öresavrundning → 3740
  total: number; // att betala, hel krona
};

export function calculateTotals(rows: InvoiceRowInput[], applyVat: boolean): InvoiceTotals {
  const groups = new Map<number, { net: number; vat: number }>();

  for (const r of rows) {
    if (r.isTextRow) continue;
    const lineNetOre = Math.round(
      kronorToOre(r.unitPrice) * r.quantity * (1 - r.discountPct / 100)
    );
    const rate = applyVat ? r.vatRate : 0;
    const g = groups.get(rate) ?? { net: 0, vat: 0 };
    g.net += lineNetOre;
    groups.set(rate, g);
  }

  // Moms beräknas per skattesatsgrupp på summerat underlag (praxis + minst öresfel)
  let netOre = 0;
  let vatOre = 0;
  const vatGroups: VatGroup[] = [];
  for (const [rate, g] of [...groups.entries()].sort((a, b) => b[0] - a[0])) {
    const groupVat = vatOnNet(g.net, rate);
    netOre += g.net;
    vatOre += groupVat;
    vatGroups.push({ rate, net: oreToKronor(g.net), vat: oreToKronor(groupVat) });
  }

  const { rounded, rounding } = roundToKrona(netOre + vatOre);
  return {
    net: oreToKronor(netOre),
    vatGroups,
    vat: oreToKronor(vatOre),
    rounding: oreToKronor(rounding),
    total: oreToKronor(rounded),
  };
}

/** Kontering av kundfaktura (faktureringsmetoden), per momssats-grupp och konto */
export function invoicePostingRows(
  rows: InvoiceRowInput[],
  totals: InvoiceTotals,
  applyVat: boolean
): { account: number; debit: number; credit: number; note?: string }[] {
  const posting: { account: number; debit: number; credit: number; note?: string }[] = [
    { account: 1510, debit: totals.total, credit: 0, note: "Kundfordran" },
  ];

  // Intäkter per konto
  const perAccount = new Map<number, number>();
  for (const r of rows) {
    if (r.isTextRow) continue;
    const lineNetOre = Math.round(
      kronorToOre(r.unitPrice) * r.quantity * (1 - r.discountPct / 100)
    );
    perAccount.set(r.account, (perAccount.get(r.account) ?? 0) + lineNetOre);
  }
  for (const [account, netOre] of perAccount) {
    posting.push({ account, debit: 0, credit: oreToKronor(netOre) });
  }

  // Utgående moms per sats
  if (applyVat) {
    const vatAccount: Record<number, number> = { 25: 2611, 12: 2621, 6: 2631 };
    for (const g of totals.vatGroups) {
      if (g.vat > 0 && vatAccount[g.rate]) {
        posting.push({ account: vatAccount[g.rate], debit: 0, credit: g.vat });
      }
    }
  }

  // Öresavrundning
  if (totals.rounding !== 0) {
    posting.push(
      totals.rounding > 0
        ? { account: 3740, debit: 0, credit: totals.rounding }
        : { account: 3740, debit: -totals.rounding, credit: 0 }
    );
  }
  return posting;
}

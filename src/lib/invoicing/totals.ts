import { kronorToOre, oreToKronor, roundAmount, roundToKrona, vatOnNet } from "@/lib/money";

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
    const lineNetOre = roundAmount(
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
  const posting: { account: number; debit: number; credit: number; note?: string }[] = [];

  /**
   * Lägg ett belopp på rätt sida av kontot. Ett negativt belopp är en DEBET,
   * aldrig en negativ kredit: en fakturarad med prisavdrag, en kreditrad eller
   * en satsgrupp som blivit negativ ska bokföras med omvänt tecken på rätt
   * sida, annars stämmer varken debet- eller kreditsumman i verifikatet.
   */
  const post = (account: number, amount: number, note?: string) => {
    const row = amount >= 0
      ? { account, debit: 0, credit: amount }
      : { account, debit: -amount, credit: 0 };
    posting.push(note ? { ...row, note } : row);
  };

  post(1510, -totals.total, "Kundfordran");

  // Intäkter per konto
  const perAccount = new Map<number, number>();
  for (const r of rows) {
    if (r.isTextRow) continue;
    const lineNetOre = roundAmount(
      kronorToOre(r.unitPrice) * r.quantity * (1 - r.discountPct / 100)
    );
    perAccount.set(r.account, (perAccount.get(r.account) ?? 0) + lineNetOre);
  }
  for (const [account, netOre] of perAccount) {
    post(account, oreToKronor(netOre));
  }

  // Utgående moms per sats. Villkoret är g.vat !== 0, inte g.vat > 0: en
  // satsgrupp med negativt underlag (prisavdrag som avser en annan skattesats
  // än huvudraden) har negativ moms, och den momsen MÅSTE bokföras. Släpps den
  // blir verifikatet obalanserat och både beskattningsunderlaget i ruta 05 och
  // den utgående momsen i ruta 10/11/12 fel (17 kap. 24 § mervärdesskattelagen
  // [2023:200]; Skatteverket, "Fylla i momsdeklarationen", fält 05 och 10–12).
  if (applyVat) {
    const vatAccount: Record<number, number> = { 25: 2611, 12: 2621, 6: 2631 };
    for (const g of totals.vatGroups) {
      if (g.vat === 0) continue;
      if (!vatAccount[g.rate]) {
        throw new Error(
          `Momssatsen ${g.rate} % saknar utgående momskonto. Endast 25, 12, 6 och 0 procent är giltiga svenska momssatser.`
        );
      }
      post(vatAccount[g.rate], g.vat);
    }
  }

  // Öresavrundning
  if (totals.rounding !== 0) post(3740, totals.rounding);

  // Ett verifikat som inte balanserar får aldrig nå bokföringen. Kontrollen är
  // sista spärren: den fångar varje framtida ändring som tappar en post.
  const debit = posting.reduce((s, r) => s + Math.round(r.debit * 100), 0);
  const credit = posting.reduce((s, r) => s + Math.round(r.credit * 100), 0);
  if (debit !== credit) {
    throw new Error(
      `Fakturans verifikat balanserar inte: debet ${oreToKronor(debit)} kr mot kredit ${oreToKronor(credit)} kr. Kontrollera radernas belopp och momssatser.`
    );
  }
  return posting;
}

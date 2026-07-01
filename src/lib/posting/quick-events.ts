import { kronorToOre, oreToKronor, vatFromGross } from "@/lib/money";

export type PostingRow = {
  account: number;
  debit: number; // kronor (två decimaler) — konverteras från ören vid byggsteget
  credit: number;
  note?: string;
};

export type QuickEventResult = {
  description: string;
  rows: PostingRow[];
};

/** Eget uttag: D 2013 / K 1930 */
export function egetUttag(amountKr: number): QuickEventResult {
  return {
    description: "Eget uttag",
    rows: [
      { account: 2013, debit: amountKr, credit: 0 },
      { account: 1930, debit: 0, credit: amountKr },
    ],
  };
}

/** Egen insättning: D 1930 / K 2018 */
export function egenInsattning(amountKr: number): QuickEventResult {
  return {
    description: "Egen insättning",
    rows: [
      { account: 1930, debit: amountKr, credit: 0 },
      { account: 2018, debit: 0, credit: amountKr },
    ],
  };
}

/** Debiterad preliminärskatt (F-skatt): D 2012 / K 1930 — eget uttag, ALDRIG kostnad */
export function fSkatt(amountKr: number): QuickEventResult {
  return {
    description: "Debiterad preliminärskatt (F-skatt)",
    rows: [
      { account: 2012, debit: amountKr, credit: 0, note: "Egen skatt — ej kostnad" },
      { account: 1930, debit: 0, credit: amountKr },
    ],
  };
}

/** Köp mot kvitto (betalt med företagskonto): D kostnadskonto + D 2640 / K 1930 */
export function kopMotKvitto(
  grossKr: number,
  vatRatePct: number,
  expenseAccount: number,
  description: string,
  paidPrivately = false // betalt privat → K 2018 (egen insättning) i stället för 1930
): QuickEventResult {
  const grossOre = kronorToOre(grossKr);
  const vatOre = vatFromGross(grossOre, vatRatePct);
  const netOre = grossOre - vatOre;
  const rows: PostingRow[] = [
    { account: expenseAccount, debit: oreToKronor(netOre), credit: 0 },
  ];
  if (vatOre > 0) rows.push({ account: 2640, debit: oreToKronor(vatOre), credit: 0 });
  rows.push({
    account: paidPrivately ? 2018 : 1930,
    debit: 0,
    credit: grossKr,
    note: paidPrivately ? "Betalt privat (egen insättning)" : undefined,
  });
  return { description, rows };
}

/** Milersättning egen bil: D 5800 / K 2018 (skattefri ersättning till dig själv, betald privat) */
export function milersattning(mil: number, kronorPerMil: number): QuickEventResult {
  const amount = Math.round(mil * kronorPerMil * 100) / 100;
  return {
    description: `Milersättning egen bil, ${mil} mil à ${kronorPerMil} kr`,
    rows: [
      { account: 5800, debit: amount, credit: 0, note: `${mil} mil × ${kronorPerMil} kr/mil` },
      { account: 2018, debit: 0, credit: amount, note: "Skattefri ersättning, egen insättning" },
    ],
  };
}

/**
 * Traktamente vid tjänsteresa med övernattning (schablonavdrag för ökade
 * levnadskostnader): D 5831 / K 2018. Kräver resa med övernattning > 50 km
 * från bostaden/verksamhetsorten.
 */
export function traktamente(
  wholeDays: number,
  halfDays: number,
  nights: number,
  rates: { helt: number; halvt: number; natt: number }
): QuickEventResult {
  const amount =
    Math.round((wholeDays * rates.helt + halfDays * rates.halvt + nights * rates.natt) * 100) / 100;
  const parts = [
    wholeDays > 0 ? `${wholeDays} hel dag à ${rates.helt} kr` : null,
    halfDays > 0 ? `${halfDays} halv dag à ${rates.halvt} kr` : null,
    nights > 0 ? `${nights} natt à ${rates.natt} kr` : null,
  ].filter(Boolean).join(", ");
  return {
    description: `Traktamente tjänsteresa (${parts})`,
    rows: [
      { account: 5831, debit: amount, credit: 0, note: "Schablonavdrag ökade levnadskostnader" },
      { account: 2018, debit: 0, credit: amount, note: "Egen insättning" },
    ],
  };
}

/**
 * Representation (måltid): måltidskostnad är EJ avdragsgill inkomstskattemässigt,
 * men moms får lyftas på underlag upp till maxUnderlagKr (300 kr) per person.
 * Överskjutande moms + hela nettot → 6072 ej avdragsgill.
 * Enklare förtäring ≤ enklareGransKr (60 kr) per person → 6071 avdragsgill.
 */
export function representation(
  grossKr: number,
  vatRatePct: number,
  persons: number,
  maxUnderlagKr: number,
  enklareGransKr: number,
  paidPrivately = false
): QuickEventResult {
  const grossOre = kronorToOre(grossKr);
  const vatOre = vatFromGross(grossOre, vatRatePct);
  const netOre = grossOre - vatOre;
  const netPerPerson = netOre / persons;

  // Avdragsgill moms: momssatsen på underlag upp till max 300 kr/person
  const cappedNetOre = Math.min(netOre, kronorToOre(maxUnderlagKr) * persons);
  const deductibleVatOre = Math.min(vatOre, Math.round((cappedNetOre * vatRatePct) / 100));
  const nonDeductibleVatOre = vatOre - deductibleVatOre;

  const isEnklare = netPerPerson <= kronorToOre(enklareGransKr);
  const rows: PostingRow[] = [];

  if (isEnklare) {
    rows.push({
      account: 6071,
      debit: oreToKronor(netOre),
      credit: 0,
      note: `Enklare förtäring, ${persons} pers`,
    });
  } else {
    rows.push({
      account: 6072,
      debit: oreToKronor(netOre + nonDeductibleVatOre),
      credit: 0,
      note: `Måltid ${persons} pers — ej avdragsgill (återläggs i NE)`,
    });
  }
  if (deductibleVatOre > 0) {
    rows.push({
      account: 2640,
      debit: oreToKronor(deductibleVatOre),
      credit: 0,
      note: `Moms på underlag max ${maxUnderlagKr} kr/person`,
    });
  }
  if (isEnklare && nonDeductibleVatOre > 0) {
    rows.push({ account: 6071, debit: oreToKronor(nonDeductibleVatOre), credit: 0 });
  }
  rows.push({ account: paidPrivately ? 2018 : 1930, debit: 0, credit: grossKr });
  return { description: `Representation, ${persons} personer`, rows };
}

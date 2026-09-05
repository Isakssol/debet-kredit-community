/**
 * Aggregeringen bakom Analys-sidans diagram.
 *
 * Ren räkning, inga anrop och ingen rendering — så att siffrorna går att prova
 * utan databas. Alla belopp är i kronor (samma enhet som `verification_rows`
 * levererar dem); formateringen sker först i vyn.
 */

/** BAS-kontoklasserna som utgör rörelsens kostnader, med begripliga namn. */
export const COST_CLASSES = [
  { klass: 4, label: "Varor, material och köpta tjänster" },
  { klass: 5, label: "Lokal, förbrukning och resor" },
  { klass: 6, label: "Kontor, reklam och försäkringar" },
  { klass: 7, label: "Personal och avskrivningar" },
] as const;

export type Segment = { label: string; value: number; share: number };

/**
 * Kostnaderna fördelade på BAS-kontoklass 4–7.
 *
 * Klasser som netto är noll eller negativa utelämnas: en andelsstapel kan inte
 * rita en negativ andel, och negativt netto på en kostnadsklass betyder i
 * praktiken att en rättelse eller kreditering överstiger årets kostnad.
 */
export function costByClass(rows: { account: number; amount: number }[]):
{ segments: Segment[]; total: number } {
  const sums = new Map<number, number>();
  for (const r of rows) {
    const klass = Math.floor(r.account / 1000);
    if (klass < 4 || klass > 7) continue;
    sums.set(klass, (sums.get(klass) ?? 0) + r.amount);
  }
  const positive = COST_CLASSES
    .map((c) => ({ label: c.label, value: sums.get(c.klass) ?? 0 }))
    .filter((c) => c.value > 0);
  const total = positive.reduce((s, c) => s + c.value, 0);
  return {
    segments: positive.map((c) => ({ ...c, share: total > 0 ? c.value / total : 0 })),
    total,
  };
}

/**
 * Bruttomarginal per månad i procent: (omsättning − varukostnad) / omsättning.
 *
 * `null` för månader utan omsättning — en marginal på noll och "ingen
 * försäljning alls" är två helt olika saker, och en linje som faller till
 * noll i juli skulle påstå det första.
 */
export function grossMarginByMonth(
  revenue: readonly number[],
  cogs: readonly number[],
): (number | null)[] {
  return revenue.map((rev, i) =>
    rev > 0 ? ((rev - (cogs[i] ?? 0)) / rev) * 100 : null);
}

export type ParetoItem = {
  label: string; value: number;
  /** Andel av totalen, 0–1 */
  share: number;
  /** Ackumulerad andel till och med den här posten, 0–1 */
  cumulative: number;
};

/**
 * Topplista med ackumulerad andel — grunden för kundkoncentrationen.
 *
 * Andelarna räknas mot HELA totalen, inte mot topplistan, annars ser varje
 * företag ut att ha exakt 100 % av omsättningen hos sina tio största kunder.
 * Poster med noll eller negativt belopp (rena krediteringar) hoppas över.
 */
export function paretoOf(
  entries: readonly (readonly [string, number])[],
  top = 10,
): { items: ParetoItem[]; total: number; restCount: number; restValue: number } {
  const positive = [...entries].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = positive.reduce((s, [, v]) => s + v, 0);
  const head = positive.slice(0, top);
  let running = 0;
  const items = head.map(([label, value]) => {
    running += value;
    return {
      label, value,
      share: total > 0 ? value / total : 0,
      cumulative: total > 0 ? running / total : 0,
    };
  });
  const rest = positive.slice(top);
  return {
    items, total,
    restCount: rest.length,
    restValue: rest.reduce((s, [, v]) => s + v, 0),
  };
}

/** Topplista utan ackumulering — de största posterna plus en samlingspost. */
export function topWithRest(
  entries: readonly (readonly [string, number])[],
  top = 10,
): { label: string; value: number }[] {
  const positive = [...entries].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const items = positive.slice(0, top).map(([label, value]) => ({ label, value }));
  const rest = positive.slice(top);
  if (rest.length) {
    items.push({
      label: `Övriga ${rest.length} st`,
      value: rest.reduce((s, [, v]) => s + v, 0),
    });
  }
  return items;
}

export type AgingBucket = { label: string; value: number; count: number; overdue: boolean };

/** Dagar mellan två ISO-datum (b − a). Rena datum, ingen tidszon inblandad. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Åldersanalys av utestående fordringar.
 *
 * Fakturor utan förfallodatum räknas som ej förfallna — de kan inte vara sena
 * mot en tidpunkt som inte finns. Belopp som är noll eller mindre (helt
 * betalda, överbetalda) hör inte hemma i en åldersanalys alls.
 */
export function agingBuckets(
  invoices: readonly { dueDate: string | null; outstanding: number }[],
  today: string,
): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: "Inte förfallet", value: 0, count: 0, overdue: false },
    { label: "1–30 dagar sent", value: 0, count: 0, overdue: true },
    { label: "31–60 dagar sent", value: 0, count: 0, overdue: true },
    { label: "Över 60 dagar sent", value: 0, count: 0, overdue: true },
  ];
  for (const inv of invoices) {
    if (inv.outstanding <= 0) continue;
    const late = inv.dueDate ? daysBetween(inv.dueDate, today) : 0;
    const i = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3;
    buckets[i].value += inv.outstanding;
    buckets[i].count += 1;
  }
  return buckets;
}

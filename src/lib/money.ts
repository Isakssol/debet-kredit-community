/**
 * Alla belopp hanteras i ören (heltal) i beräkningslogiken för att undvika
 * flyttalsfel. Databasen lagrar numeric(12,2) i kronor — konvertering sker
 * vid läs/skriv.
 */

export type Ore = number;

export function kronorToOre(kronor: number | string): Ore {
  const n = typeof kronor === "string" ? parseFloat(kronor.replace(",", ".")) : kronor;
  return Math.round(n * 100);
}

export function oreToKronor(ore: Ore): number {
  return ore / 100;
}

/** Moms på ett nettobelopp, avrundat till hela ören */
export function vatOnNet(netOre: Ore, ratePct: number): Ore {
  return Math.round((netOre * ratePct) / 100);
}

/** Plocka ut momsdelen ur ett bruttobelopp (t.ex. kvitto inkl. moms) */
export function vatFromGross(grossOre: Ore, ratePct: number): Ore {
  return Math.round(grossOre - (grossOre * 100) / (100 + ratePct));
}

/** Öresavrundning till hel krona (fakturatotaler) — differensen bokförs på 3740 */
export function roundToKrona(ore: Ore): { rounded: Ore; rounding: Ore } {
  const rounded = Math.round(ore / 100) * 100;
  return { rounded, rounding: rounded - ore };
}

export function formatSEK(ore: Ore): string {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 2,
  }).format(ore / 100);
}

export function formatAmount(ore: Ore): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ore / 100);
}

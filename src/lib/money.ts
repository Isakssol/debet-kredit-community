/**
 * Alla belopp hanteras i ören (heltal) i beräkningslogiken för att undvika
 * flyttalsfel. Databasen lagrar numeric(12,2) i kronor — konvertering sker
 * vid läs/skriv.
 */

export type Ore = number;

/**
 * Avrundning av BELOPP: halvvärden avrundas bort från noll, så att
 * round(15,5) = 16 och round(−15,5) = −16. Math.round ensamt avrundar
 * halvvärden mot +oändligheten och är därmed inte teckensymmetrisk — en
 * negerad rad (kreditfaktura, återbetalning, negativ prisjustering) skulle då
 * inte bli exakt negationen av originalet. Halvvärden bort från noll är också
 * den kommersiella avrundningskonventionen för belopp.
 */
export function roundAmount(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Ören som databasen räknar dem: `::numeric(12,2)` i Postgres är EXAKT decimal
 * och avrundar halvor från noll, medan JS Number är binär IEEE-754. Skillnaden
 * är inte teoretisk: `Math.round(1.005 * 100)` ger 100 (eftersom 1.005 * 100 =
 * 100.49999999999999 i binära flyttal) medan Postgres gör 1,005 → 1,01 = 101
 * ören. En förkontroll i appen som räknar med flyttal kan därför säga
 * "balanserar" om ett verifikat som motorn sedan avvisar — användaren får ett
 * kryptiskt motorfel på något gränssnittet just godkände.
 *
 * toOre räknar därför på DECIMALREPRESENTATIONEN: samma sträng som skickas till
 * databasen i JSON-anropet, med halvor avrundade från noll. Använd den överallt
 * där ett belopp ska jämföras med, eller skickas till, book_verification.
 */
export function toOre(value: number | string): Ore {
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (raw === "" || !Number.isFinite(Number(raw))) return NaN;
  // Exponentform (1e-7) har ingen decimalrepresentation att läsa siffror ur —
  // skriv ut den först. Tio decimaler räcker: större precision än så finns inte
  // i något belopp programmet hanterar.
  const text = /e/i.test(raw) ? Number(raw).toFixed(10) : raw;
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m) return NaN;
  const [, sign, intPart, fracPart = ""] = m;
  const keep = fracPart.slice(0, 2).padEnd(2, "0");
  const third = fracPart.charCodeAt(2) - 48; // NaN om decimalen saknas
  let ore = Number(intPart || "0") * 100 + Number(keep);
  if (third >= 5) ore += 1; // halvor avrundas från noll, precis som numeric(12,2)
  return sign === "-" ? -ore : ore;
}

/** Beloppet avrundat till hela ören, som databasen lagrar det. */
export function toKronor2(value: number | string): number {
  return toOre(value) / 100;
}

export function kronorToOre(kronor: number | string): Ore {
  const n = typeof kronor === "string" ? parseFloat(kronor.replace(",", ".")) : kronor;
  return roundAmount(n * 100);
}

export function oreToKronor(ore: Ore): number {
  return ore / 100;
}

/** Moms på ett nettobelopp, avrundat till hela ören */
export function vatOnNet(netOre: Ore, ratePct: number): Ore {
  return roundAmount((netOre * ratePct) / 100);
}

/** Plocka ut momsdelen ur ett bruttobelopp (t.ex. kvitto inkl. moms) */
export function vatFromGross(grossOre: Ore, ratePct: number): Ore {
  return roundAmount(grossOre - (grossOre * 100) / (100 + ratePct));
}

/**
 * Öresavrundning till hel krona (fakturatotaler) — differensen bokförs på 3740.
 *
 * Avrundningen är TECKENSYMMETRISK: 15,50 kr blir 16,00 kr och −15,50 kr blir
 * −16,00 kr. Math.round ensamt avrundar halvvärden mot +oändligheten och hade
 * gett −15,00 kr, vilket gör att en full kreditfaktura inte nollar ut
 * originalet. En ändringsfaktura ska spegla de uppgifter i ursprungsfakturan
 * som ändras (17 kap. 22 § och 17 kap. 28 § 5 mervärdesskattelagen [2023:200]),
 * så kreditnotans belopp måste vara exakt originalets med omvänt tecken.
 */
export function roundToKrona(ore: Ore): { rounded: Ore; rounding: Ore } {
  const rounded = roundAmount(ore / 100) * 100;
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

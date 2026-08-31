/**
 * SRU-filer för inkomstdeklaration (enskild firma): INFO.SRU + BLANKETTER.SRU
 * enligt Skatteverkets tekniska beskrivning för filöverföring.
 *
 * Fältkoder verifierade mot Skatteverkets SRU-specifikation 2025P4
 * (NE_SKV2161 + INK1_SKV2000). Teckenkodning ISO 8859-1, positiva belopp utan
 * tecken, negativa med bindestreck, hela kronor. Testa filerna i Skatteverkets
 * testmiljö: https://www1.skatteverket.se/fv/fv_web/systemval.do
 */

/** NE-blankettens fält → SRU-kod (spec 2025P4) */
export const NE_SRU_CODES: Record<string, number> = {
  B1: 7200, B2: 7210, B3: 7211, B4: 7212, B5: 7213, B6: 7240, B7: 7250,
  B8: 7260, B9: 7280, B10: 7300, B11: 7320, B12: 7330, B13: 7380, B14: 7381,
  B15: 7382, B16: 7383,
  R1: 7400, R2: 7401, R3: 7402, R4: 7403, R5: 7500, R6: 7501, R7: 7502,
  R8: 7503, R9: 7504, R10: 7505, R11: 7440,
};

const sruAmount = (n: number) => String(Math.round(n));

export type SruParty = {
  /** Person-/organisationsnummer, 12 siffror */
  id12: string;
  name: string;
  postalCode: string;
  city: string;
};

export function buildInfoSru(party: SruParty, created: Date, programName: string): string {
  const d = created.toISOString().slice(0, 10).replace(/-/g, "");
  const t = created.toISOString().slice(11, 19).replace(/:/g, "");
  return [
    "#DATABESKRIVNING_START",
    "#PRODUKT SRU",
    `#SKAPAD ${d} ${t}`,
    `#PROGRAM ${programName}`,
    "#FILNAMN BLANKETTER.SRU",
    "#DATABESKRIVNING_SLUT",
    "#MEDIELEV_START",
    `#ORGNR ${party.id12}`,
    `#NAMN ${party.name}`,
    `#POSTNR ${party.postalCode.replace(/\s/g, "")}`,
    `#POSTORT ${party.city}`,
    "#MEDIELEV_SLUT",
    "",
  ].join("\r\n");
}

export type NeSruInput = {
  taxYear: number;                    // beskattningsår, t.ex. 2026 → NE-2026P4
  id12: string;                      // deklarantens personnummer, 12 siffror
  name: string;
  fiscalStart: string;               // YYYY-MM-DD
  fiscalEnd: string;
  activityDescription: string;       // verksamhetens art (fält 7020)
  neValues: Map<string, number>;     // B1–B16, R1–R10
  bookedResult: number;              // R11/R12
  created: Date;
};

/**
 * BLANKETTER.SRU med NE + INK1. Skattemässiga justeringar hålls minimala:
 * R43 schablonavdrag egenavgifter 25 % (endast vid överskott) → R47/R48,
 * som även förs till INK1 ruta 10.1/10.2 (aktiv enskild näringsverksamhet).
 */
export function buildBlanketterSru(input: NeSruInput): string {
  const d = input.created.toISOString().slice(0, 10).replace(/-/g, "");
  const t = input.created.toISOString().slice(11, 19).replace(/:/g, "");
  const identitet = `#IDENTITET ${input.id12} ${d} ${t}`;

  const result = Math.round(input.bookedResult);
  const r43 = result > 0 ? Math.round(result * 0.25) : 0;  // schablonavdrag egenavgifter
  const after = result - r43;
  const lines: string[] = [];

  // ---- NE ----
  lines.push(`#BLANKETT NE-${input.taxYear}P4`);
  lines.push(identitet);
  lines.push(`#NAMN ${input.name}`);
  lines.push(`#UPPGIFT 7011 ${input.fiscalStart.replace(/-/g, "")}`);
  lines.push(`#UPPGIFT 7012 ${input.fiscalEnd.replace(/-/g, "")}`);
  lines.push(`#UPPGIFT 7020 ${input.activityDescription.slice(0, 80)}`);
  for (const [field, code] of Object.entries(NE_SRU_CODES)) {
    if (field === "R11") continue;
    const value = Math.round(input.neValues.get(field) ?? 0);
    if (value === 0) continue;
    // R-fälten anges som positiva belopp i sina kolumner; B-fält kan vara
    // negativa (t.ex. B10 Eget kapital) och behåller tecknet.
    const out = field.startsWith("R") ? Math.abs(value) : value;
    lines.push(`#UPPGIFT ${code} ${sruAmount(out)}`);
  }
  lines.push(`#UPPGIFT 7440 ${sruAmount(result)}`);          // R11 bokfört resultat (kan vara negativt)
  lines.push(`#UPPGIFT 7600 ${sruAmount(result)}`);          // R12
  if (r43 > 0) lines.push(`#UPPGIFT 7714 ${sruAmount(r43)}`); // R43
  if (after >= 0) lines.push(`#UPPGIFT 7630 ${sruAmount(after)}`);      // R47 överskott
  else lines.push(`#UPPGIFT 7730 ${sruAmount(Math.abs(after))}`);       // R48 underskott
  lines.push("#BLANKETTSLUT");

  // ---- INK1 (utkast — signeras på Mina sidor) ----
  lines.push(`#BLANKETT INK1-${input.taxYear}P4`);
  lines.push(identitet);
  lines.push(`#NAMN ${input.name}`);
  if (after >= 0) lines.push(`#UPPGIFT 1200 ${sruAmount(after)}`);      // 10.1 överskott aktiv EF
  else lines.push(`#UPPGIFT 1202 ${sruAmount(Math.abs(after))}`);       // 10.2 underskott aktiv EF
  lines.push("#BLANKETTSLUT");

  lines.push("#FIL_SLUT");
  lines.push("");
  return lines.join("\r\n");
}

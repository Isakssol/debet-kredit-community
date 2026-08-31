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

/* ------------------------------------------------------------------ */
/*  INK2 — aktiebolagets inkomstdeklaration (INK2 + INK2R + INK2S)     */
/*  Fältkoder verifierade mot SKV:s SRU-spec 2025P4 (INK2_SKV2002).    */
/* ------------------------------------------------------------------ */

export type Ink2Input = {
  taxYear: number;
  org12: string;                     // organisationsnummer, 12 siffror (16-prefix)
  name: string;
  fiscalStart: string;
  fiscalEnd: string;
  lines: { account: number; closing: number }[];
  created: Date;
};

const sumRange = (
  lines: { account: number; closing: number }[],
  from: number, to: number, exclude: number[] = []
) => lines
  .filter((l) => l.account >= from && l.account <= to && !exclude.includes(l.account))
  .reduce((s, l) => s + l.closing, 0);

/**
 * BLANKETTER.SRU för aktiebolag: tre block (INK2, INK2R, INK2S).
 * Räkenskapsschemat mappas från BAS-intervall — förenklad mappning för
 * mindre tjänste-/handelsbolag (t.ex. hela klass 4 → råvaror/förnödenheter).
 * Skattemässiga justeringar: endast bokförd skatt återläggs (4.3a) —
 * övriga justeringar görs i Skatteverkets e-tjänst vid behov.
 */
export function buildInk2Sru(input: Ink2Input): string {
  const d = input.created.toISOString().slice(0, 10).replace(/-/g, "");
  const t = input.created.toISOString().slice(11, 19).replace(/:/g, "");
  const identitet = `#IDENTITET ${input.org12} ${d} ${t}`;
  const L = input.lines;
  const out: string[] = [];
  const up = (code: number, value: number) => {
    const v = Math.round(value);
    if (v !== 0) out.push(`#UPPGIFT ${code} ${v}`);
  };

  // ---- Belopp ur bokföringen ----
  const bokfordSkatt = sumRange(L, 8900, 8998);                    // debet = kostnad
  const resultatEfterSkatt = -sumRange(L, 3000, 8998);             // vinst positiv
  const overskott = Math.round(resultatEfterSkatt + bokfordSkatt); // enkel återläggning

  // ---- INK2 huvudblankett ----
  out.push(`#BLANKETT INK2-${input.taxYear}P4`);
  out.push(identitet);
  out.push(`#NAMN ${input.name}`);
  out.push(`#UPPGIFT 7011 ${input.fiscalStart.replace(/-/g, "")}`);
  out.push(`#UPPGIFT 7012 ${input.fiscalEnd.replace(/-/g, "")}`);
  if (overskott >= 0) up(7104, overskott); else up(7114, Math.abs(overskott));
  out.push("#BLANKETTSLUT");

  // ---- INK2R räkenskapsschema ----
  out.push(`#BLANKETT INK2R-${input.taxYear}P4`);
  out.push(identitet);
  out.push(`#NAMN ${input.name}`);
  out.push(`#UPPGIFT 7011 ${input.fiscalStart.replace(/-/g, "")}`);
  out.push(`#UPPGIFT 7012 ${input.fiscalEnd.replace(/-/g, "")}`);
  // Tillgångar
  up(7201, sumRange(L, 1000, 1099));                    // 2.1 immateriella
  up(7214, sumRange(L, 1100, 1199));                    // 2.3 byggnader och mark
  up(7215, sumRange(L, 1200, 1299));                    // 2.4 maskiner/inventarier
  up(7233, sumRange(L, 1300, 1399));                    // 2.9 långfristiga värdepapper
  up(7243, sumRange(L, 1400, 1499));                    // 2.15 färdiga varor/handelsvaror
  up(7251, sumRange(L, 1500, 1599));                    // 2.19 kundfordringar
  up(7261, sumRange(L, 1600, 1699));                    // 2.21 övriga fordringar
  up(7263, sumRange(L, 1700, 1799));                    // 2.23 förutbetalda kostnader
  up(7281, sumRange(L, 1900, 1999));                    // 2.26 kassa och bank
  // Eget kapital och skulder (kreditsaldon → positiva)
  up(7301, -sumRange(L, 2080, 2089));                   // 2.27 bundet eget kapital
  // 2.28 fritt eget kapital: balanserat + årets resultat. Är resultatet inte
  // bokfört mot 2099/2019 ännu läggs det beräknade till så balansen stämmer.
  const bokatResultat = -(sumRange(L, 2099, 2099) + sumRange(L, 2019, 2019));
  up(7302, -sumRange(L, 2090, 2098) + bokatResultat + (bokatResultat === 0 ? resultatEfterSkatt : 0));
  up(7321, -sumRange(L, 2110, 2149));                   // 2.29 periodiseringsfonder
  up(7322, -sumRange(L, 2150, 2159));                   // 2.30 överavskrivningar
  up(7323, -sumRange(L, 2160, 2199));                   // 2.31 övriga obeskattade
  up(7333, -sumRange(L, 2200, 2299));                   // 2.34 övriga avsättningar
  up(7354, -sumRange(L, 2300, 2399));                   // 2.39 övriga långfristiga skulder
  up(7361, -sumRange(L, 2400, 2439));                   // 2.41 kortfr. kreditinstitut m.m.
  up(7365, -sumRange(L, 2440, 2449));                   // 2.45 leverantörsskulder
  up(7369, -(sumRange(L, 2450, 2499) + sumRange(L, 2600, 2899))); // 2.48 övriga kortfr. skulder
  up(7368, -sumRange(L, 2500, 2599));                   // 2.49 skatteskulder
  up(7370, -sumRange(L, 2900, 2999));                   // 2.50 upplupna kostnader
  // Resultaträkning
  up(7410, -sumRange(L, 3000, 3799, [3740]));           // 3.1 nettoomsättning
  up(7413, -(sumRange(L, 3740, 3740) + sumRange(L, 3800, 3999))); // 3.4 övriga rörelseintäkter
  up(7511, sumRange(L, 4000, 4999));                    // 3.5 råvaror och förnödenheter
  up(7513, sumRange(L, 5000, 6999));                    // 3.7 övriga externa kostnader
  up(7514, sumRange(L, 7000, 7699));                    // 3.8 personalkostnader
  up(7515, sumRange(L, 7700, 7899));                    // 3.9 av- och nedskrivningar
  up(7517, sumRange(L, 7900, 7999));                    // 3.11 övriga rörelsekostnader
  const finIntakt = -sumRange(L, 8000, 8399);
  if (finIntakt > 0) up(7417, finIntakt);               // 3.16 ränteintäkter
  up(7522, sumRange(L, 8400, 8799));                    // 3.18 räntekostnader
  const disp = -sumRange(L, 8800, 8899);
  if (disp > 0) up(7422, disp); else up(7527, Math.abs(disp)); // 3.24 bokslutsdispositioner
  up(7528, bokfordSkatt);                               // 3.25 skatt på årets resultat
  if (resultatEfterSkatt >= 0) up(7450, resultatEfterSkatt);   // 3.26 vinst
  else up(7550, Math.abs(resultatEfterSkatt));                 // 3.27 förlust
  out.push("#BLANKETTSLUT");

  // ---- INK2S skattemässiga justeringar ----
  out.push(`#BLANKETT INK2S-${input.taxYear}P4`);
  out.push(identitet);
  out.push(`#NAMN ${input.name}`);
  out.push(`#UPPGIFT 7011 ${input.fiscalStart.replace(/-/g, "")}`);
  out.push(`#UPPGIFT 7012 ${input.fiscalEnd.replace(/-/g, "")}`);
  if (resultatEfterSkatt >= 0) up(7650, resultatEfterSkatt);   // 4.1 vinst
  else up(7750, Math.abs(resultatEfterSkatt));                 // 4.2 förlust
  up(7651, bokfordSkatt);                                       // 4.3a skatt återläggs
  if (overskott >= 0) up(7670, overskott);                     // 4.15 → INK2 1.1
  else up(7770, Math.abs(overskott));                          // 4.16 → INK2 1.2
  out.push("#BLANKETTSLUT");

  out.push("#FIL_SLUT");
  out.push("");
  return out.join("\r\n");
}

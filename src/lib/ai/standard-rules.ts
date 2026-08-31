/**
 * Standardkonteringsregler per bolagstyp — juridiskt korrekta utgångspunkter
 * enligt BAS-kontoplanen och god redovisningssed. Gäller automatiskt tills
 * användaren skriver egna regler under Inställningar → AI-bokföraren.
 *
 * OBS: de tvingande reglerna (momssatser, omvänd skattskyldighet, balanskrav,
 * BFL:s krav på verifikat) ligger hårdkodade i systemprompten (bookkeeper.ts)
 * och kan inte redigeras bort — reglerna här är konventioner ovanpå dem.
 */

const CORE = `– Betalning från företagets bankkonto → kreditera 1930 Företagskonto. Kortbetalning med företagskort räknas som företagskonto.
– Kvitto-/fakturanummer och leverantör tas med i verifikatbeskrivningen som intern rutin (dubblettskydd), tillsammans med vad som köpts — BFL 5:7 kräver att verifikationen visar vad affärshändelsen avser.
– Leverantörsfaktura som ännu inte är betald (faktureringsmetoden): kreditera 2440 Leverantörsskulder i stället för likvidkonto.
– Kundfakturor: 1510 Kundfordringar tills betalning sker.
– Ränta och bankavgifter: 8400/6570 — bankavgifter är momsfria.
– Försäkringspremier är momsfria → hela beloppet som kostnad (6310).
– Milersättning enligt schablon: 25 kr/mil (2026) → 5841, momsfri.
– Osäker på avdragsrätt eller privat inslag? Ställ en fråga i stället för att gissa.`;

const BY_TYPE: Record<string, string> = {
  enskild_firma: `${CORE}
– Betalning med ägarens privata pengar/kort → kreditera 2018 Egna insättningar.
– Ägaren tar ut pengar eller varor → 2013 Övriga egna uttag / 2011 Egna varuuttag.
– F-skatt och ägarens preliminärskatt → 2012 (eget uttag), aldrig kostnad.
– Friskvård och sjukvårdsförsäkring för ägaren själv: ej avdragsgillt i enskild firma.`,
  aktiebolag: `${CORE}
– Utlägg som ägare/anställd betalat privat → kreditera 2893 Skulder till närstående/aktieägare (regleras genom utbetalning eller lön).
– Ersättning till ägaren är lön (7210 + 7510 + 2710) eller beslutad utdelning (2898) — fråga om det är oklart vilket.
– Bolagets F-skatt → 2510 Skatteskulder (skattekostnaden 8910 bokförs vid bokslut).
– Friskvårdsbidrag till anställda (inkl. anställd ägare) avdragsgillt inom Skatteverkets gränser → 7690.`,
  handelsbolag: `${CORE}
– Betalning med delägares privata pengar → kreditera respektive delägares kapitalkonto (2018 delägare 1, 2020 delägare 2) och ange delägare i motiveringen.
– Delägares uttag → eget uttag mot respektive kapitalkonto.
– Delägarnas preliminärskatt är privat och ska inte belasta bolaget.`,
};

export function standardRules(companyType: string): string {
  return BY_TYPE[companyType] ?? BY_TYPE.enskild_firma;
}

/**
 * Skatteberäkning för enskild firma (aktiv näringsverksamhet, född efter 1958).
 * Förenklad modell: grundavdrag och jobbskatteavdrag ingår inte — resultatet är
 * en konservativ uppskattning för planering, inte en slutskatteberäkning.
 */

export type TaxRules = {
  egenavgifterFull: number;        // 28.97
  nedsattningPct: number;          // 7.5
  nedsattningMax: number;          // 15000
  nedsattningKrav: number;         // 40000
  schablonavdrag: number;          // 25
  periodiseringsfondPct: number;   // 30
  skiktgransStatlig: number;       // 660400
  statligSkattPct: number;         // 20
  kommunalskattPct: number;        // från inställningar
};

export type TaxInput = {
  resultat: number;                 // bokfört resultat före skattejusteringar
  ejAvdragsgilla: number;           // återläggs (6072, 6982, 6992, 8423)
  periodiseringsfondAvsattning: number;
  rantefordelning: number;          // positiv räntefördelning (flyttas till kapital)
  otherIncome: number;              // annan förvärvsinkomst (påverkar statlig skatt)
};

export type TaxResult = {
  overskottForeAvdrag: number;      // efter justeringar och avsättningar
  schablonavdragBelopp: number;
  avgiftsunderlag: number;          // = beskattningsbar näringsinkomst
  egenavgifter: number;
  nedsattning: number;
  kommunalskatt: number;
  statligSkatt: number;
  rantefordelningSkatt: number;     // 30 % kapitalskatt på räntefördelat belopp
  totalSkattOchAvgifter: number;
  kvarEfterSkatt: number;
  effektivSkattesats: number;
};

export function calculateEfTax(input: TaxInput, rules: TaxRules): TaxResult {
  // Skattemässigt resultat
  const justerat = input.resultat + input.ejAvdragsgilla
    - input.periodiseringsfondAvsattning - input.rantefordelning;
  const overskott = Math.max(0, justerat);

  // Schablonavdrag för egenavgifter (25 %)
  const schablonavdragBelopp = overskott * (rules.schablonavdrag / 100);
  const avgiftsunderlag = overskott - schablonavdragBelopp;

  // Egenavgifter med generell nedsättning
  const bruttoAvgifter = avgiftsunderlag * (rules.egenavgifterFull / 100);
  const nedsattning = avgiftsunderlag > rules.nedsattningKrav
    ? Math.min(avgiftsunderlag * (rules.nedsattningPct / 100), rules.nedsattningMax)
    : 0;
  const egenavgifter = Math.max(0, bruttoAvgifter - nedsattning);

  // Inkomstskatt på näringsinkomsten (förenklat: utan grundavdrag/jobbskatteavdrag)
  const kommunalskatt = avgiftsunderlag * (rules.kommunalskattPct / 100);
  const totalForvarvsinkomst = avgiftsunderlag + input.otherIncome;
  const statligBas = Math.max(0, totalForvarvsinkomst - rules.skiktgransStatlig);
  const statligSkatt = Math.min(statligBas, avgiftsunderlag) * (rules.statligSkattPct / 100);

  // Räntefördelat belopp beskattas som kapital 30 %
  const rantefordelningSkatt = input.rantefordelning * 0.30;

  const totalSkattOchAvgifter = egenavgifter + kommunalskatt + statligSkatt + rantefordelningSkatt;
  const disponibelt = overskott + input.rantefordelning; // det som faktiskt kan tas ut i år
  return {
    overskottForeAvdrag: overskott,
    schablonavdragBelopp,
    avgiftsunderlag,
    egenavgifter,
    nedsattning,
    kommunalskatt,
    statligSkatt,
    rantefordelningSkatt,
    totalSkattOchAvgifter,
    kvarEfterSkatt: disponibelt - totalSkattOchAvgifter,
    effektivSkattesats: disponibelt > 0 ? (totalSkattOchAvgifter / disponibelt) * 100 : 0,
  };
}

/** NE-bilagans huvudposter beräknade från kontonas NE-mappning */
export function computeNeFields(
  lines: { account: number; name: string; ne_field: string | null; closing: number }[]
): Map<string, number> {
  const ne = new Map<string, number>();
  for (const l of lines) {
    if (!l.ne_field) continue;
    // Balansposter (B): tillgångar positiva som debetsaldo, EK/skulder positiva som kreditsaldo
    // Resultatposter (R): intäkter positiva som kreditsaldo, kostnader positiva som debetsaldo
    const isB = l.ne_field.startsWith("B");
    const isEquityOrLiability = isB && l.account >= 2000;
    const isRevenue = l.ne_field === "R1" || l.ne_field === "R2" || l.ne_field === "R3" || l.ne_field === "R4";
    const value = isEquityOrLiability || isRevenue ? -l.closing : l.closing;
    ne.set(l.ne_field, (ne.get(l.ne_field) ?? 0) + value);
  }
  return ne;
}

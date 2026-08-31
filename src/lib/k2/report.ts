/**
 * Årsredovisning K2 (BFNAR 2016:10) för mindre aktiebolag — datamodell.
 * Mappar kontosaldon till K2:s uppställningsformer för resultat- och
 * balansräkning (kostnadsslagsindelad RR). Dokumentet skrivs ut/undertecknas
 * och lämnas till Bolagsverket (papper eller digitalt via deras e-tjänst).
 */

export type K2Line = { account: number; closing: number };

export type K2Row = { label: string; amount: number; bold?: boolean; note?: number };

const round = (n: number) => Math.round(n);

/** Summera konton i intervall [from, to] (debetsaldo positivt) */
function sum(lines: K2Line[], from: number, to: number, exclude: number[] = []): number {
  return lines
    .filter((l) => l.account >= from && l.account <= to && !exclude.includes(l.account))
    .reduce((s, l) => s + l.closing, 0);
}

export type K2Report = {
  incomeStatement: K2Row[];
  balanceAssets: K2Row[];
  balanceEquityLiabilities: K2Row[];
  netRevenue: number;
  result: number;
  equity: { openingCapital: number; shareCapital: number; retained: number; yearResult: number; total: number };
  balances: { assets: number; equityAndLiabilities: number };
};

export function buildK2Report(lines: K2Line[]): K2Report {
  // ---- Resultaträkning (kostnadsslagsindelad) ----
  const netRevenue = -sum(lines, 3000, 3799, [3740]);
  const otherIncome = -(sum(lines, 3740, 3740) + sum(lines, 3900, 3999));
  const materials = -sum(lines, 4000, 4999);
  const external = -sum(lines, 5000, 6999);
  const personnel = -sum(lines, 7000, 7699);
  const depreciation = -sum(lines, 7700, 7899);
  const otherOpEx = -sum(lines, 7900, 7999);
  const operatingResult = netRevenue + otherIncome + materials + external + personnel + depreciation + otherOpEx;
  const finIncome = -sum(lines, 8000, 8399);
  const finExpense = -sum(lines, 8400, 8799);
  const resultAfterFin = operatingResult + finIncome + finExpense;
  const appropriations = -sum(lines, 8800, 8899);
  const tax = -sum(lines, 8900, 8998);
  const result = resultAfterFin + appropriations + tax;

  const incomeStatement: K2Row[] = [
    { label: "Nettoomsättning", amount: round(netRevenue) },
    { label: "Övriga rörelseintäkter", amount: round(otherIncome) },
    { label: "Råvaror och förnödenheter", amount: round(materials) },
    { label: "Övriga externa kostnader", amount: round(external) },
    { label: "Personalkostnader", amount: round(personnel), note: 2 },
    { label: "Av- och nedskrivningar av materiella och immateriella anläggningstillgångar", amount: round(depreciation) },
    { label: "Övriga rörelsekostnader", amount: round(otherOpEx) },
    { label: "Rörelseresultat", amount: round(operatingResult), bold: true },
    { label: "Övriga ränteintäkter och liknande resultatposter", amount: round(finIncome) },
    { label: "Räntekostnader och liknande resultatposter", amount: round(finExpense) },
    { label: "Resultat efter finansiella poster", amount: round(resultAfterFin), bold: true },
    { label: "Bokslutsdispositioner", amount: round(appropriations) },
    { label: "Skatt på årets resultat", amount: round(tax) },
    { label: "Årets resultat", amount: round(result), bold: true },
  ].filter((r) => r.amount !== 0 || r.bold);

  // ---- Balansräkning: tillgångar ----
  const intangibles = sum(lines, 1000, 1199);
  const machines = sum(lines, 1200, 1299);
  const financialAssets = sum(lines, 1300, 1399);
  const inventory = sum(lines, 1400, 1499);
  const receivables = sum(lines, 1500, 1599);
  const otherReceivables = sum(lines, 1600, 1799);
  const cash = sum(lines, 1900, 1999);
  const assets = intangibles + machines + financialAssets + inventory + receivables + otherReceivables + cash;

  const balanceAssets: K2Row[] = [
    { label: "Immateriella anläggningstillgångar", amount: round(intangibles) },
    { label: "Materiella anläggningstillgångar (inventarier, verktyg och installationer)", amount: round(machines), note: 3 },
    { label: "Finansiella anläggningstillgångar", amount: round(financialAssets) },
    { label: "Varulager m.m.", amount: round(inventory) },
    { label: "Kundfordringar", amount: round(receivables) },
    { label: "Övriga fordringar och förutbetalda kostnader", amount: round(otherReceivables) },
    { label: "Kassa och bank", amount: round(cash) },
    { label: "SUMMA TILLGÅNGAR", amount: round(assets), bold: true },
  ].filter((r) => r.amount !== 0 || r.bold);

  // ---- Balansräkning: eget kapital och skulder ----
  const shareCapital = -sum(lines, 2081, 2081);
  const retained = -(sum(lines, 2091, 2098));
  const bookedYearResult = -(sum(lines, 2099, 2099) + sum(lines, 2019, 2019));
  const yearResult = bookedYearResult !== 0 ? bookedYearResult : result;
  const equityTotal = shareCapital + retained + yearResult;
  const untaxedReserves = -sum(lines, 2100, 2199);
  const supplierDebt = -sum(lines, 2440, 2449);
  const taxDebts = -(sum(lines, 2500, 2599) + sum(lines, 2600, 2699) + sum(lines, 2700, 2799));
  const otherDebts = -(sum(lines, 2300, 2399) + sum(lines, 2400, 2439) + sum(lines, 2450, 2499) + sum(lines, 2800, 2999));
  const equityAndLiabilities = equityTotal + untaxedReserves + supplierDebt + taxDebts + otherDebts;

  const balanceEquityLiabilities: K2Row[] = [
    { label: "Aktiekapital", amount: round(shareCapital) },
    { label: "Balanserat resultat", amount: round(retained) },
    { label: "Årets resultat", amount: round(yearResult) },
    { label: "Summa eget kapital", amount: round(equityTotal), bold: true },
    { label: "Obeskattade reserver", amount: round(untaxedReserves) },
    { label: "Leverantörsskulder", amount: round(supplierDebt) },
    { label: "Skatteskulder och momsskulder", amount: round(taxDebts) },
    { label: "Övriga skulder", amount: round(otherDebts) },
    { label: "SUMMA EGET KAPITAL OCH SKULDER", amount: round(equityAndLiabilities), bold: true },
  ].filter((r) => r.amount !== 0 || r.bold);

  return {
    incomeStatement,
    balanceAssets,
    balanceEquityLiabilities,
    netRevenue: round(netRevenue),
    result: round(result),
    equity: {
      openingCapital: round(shareCapital + retained),
      shareCapital: round(shareCapital),
      retained: round(retained),
      yearResult: round(yearResult),
      total: round(equityTotal),
    },
    balances: { assets: round(assets), equityAndLiabilities: round(equityAndLiabilities) },
  };
}

"use client";

import { useMemo, useState } from "react";
import { calculateEfTax, type TaxRules } from "@/lib/tax/calc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fmt = (n: number) => Math.round(n).toLocaleString("sv-SE");

export function TaxSimulator({
  year,
  bookedResult,
  nonDeductible,
  fSkattPaid,
  rules,
  rantefordelningRate,
  rantefordelningGrans,
}: {
  year: number;
  bookedResult: number;
  nonDeductible: number;
  fSkattPaid: number;
  rules: TaxRules;
  rantefordelningRate: number;
  rantefordelningGrans: number;
}) {
  const [expectedResult, setExpectedResult] = useState(String(Math.max(bookedResult, 0)));
  const [pFondPct, setPFondPct] = useState("0");
  const [kapitalunderlag, setKapitalunderlag] = useState("0");
  const [otherIncome, setOtherIncome] = useState("0");
  const [monthlyFSkatt, setMonthlyFSkatt] = useState("");

  const result = useMemo(() => {
    const res = parseFloat(expectedResult) || 0;
    const justerat = res + nonDeductible;
    const pFond = Math.min(parseFloat(pFondPct) || 0, rules.periodiseringsfondPct) / 100 * justerat;
    const ku = parseFloat(kapitalunderlag) || 0;
    const rf = ku > rantefordelningGrans
      ? Math.min(ku * (rantefordelningRate / 100), Math.max(0, justerat - pFond))
      : 0;
    return {
      pFond,
      rf,
      tax: calculateEfTax({
        resultat: res,
        ejAvdragsgilla: nonDeductible,
        periodiseringsfondAvsattning: pFond,
        rantefordelning: rf,
        otherIncome: parseFloat(otherIncome) || 0,
      }, rules),
    };
  }, [expectedResult, pFondPct, kapitalunderlag, otherIncome, nonDeductible, rules, rantefordelningRate, rantefordelningGrans]);

  const t = result.tax;
  const yearlyFSkatt = (parseFloat(monthlyFSkatt) || 0) * 12;
  const fSkattDiff = yearlyFSkatt - t.totalSkattOchAvgifter;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Förutsättningar</CardTitle>
          <CardDescription>
            Bokfört resultat hittills i år: <strong>{fmt(bookedResult)} kr</strong>
            {nonDeductible > 0 && <> · Ej avdragsgilla kostnader som återläggs: {fmt(nonDeductible)} kr</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Förväntat årsresultat (kr)</Label>
            <Input type="number" value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Annan förvärvsinkomst i år (lön etc.)</Label>
            <Input type="number" value={otherIncome}
              onChange={(e) => setOtherIncome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Periodiseringsfond, avsättning % (max {rules.periodiseringsfondPct} %)</Label>
            <Input type="number" min="0" max={rules.periodiseringsfondPct} value={pFondPct}
              onChange={(e) => setPFondPct(e.target.value)} />
            {result.pFond > 0 && (
              <p className="text-xs text-muted-foreground">
                Avsättning {fmt(result.pFond)} kr — skjuter upp skatten, återförs senast år {year + 6}.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Kapitalunderlag räntefördelning (kr)</Label>
            <Input type="number" value={kapitalunderlag}
              onChange={(e) => setKapitalunderlag(e.target.value)} />
            {result.rf > 0 ? (
              <p className="text-xs text-muted-foreground">
                Positiv räntefördelning {fmt(result.rf)} kr ({rantefordelningRate} %) beskattas
                som kapital 30 % i stället för som näringsinkomst.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Kräver kapitalunderlag över {fmt(rantefordelningGrans)} kr.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Beräknad skatt {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="[&_td]:py-1">
              <tr><td>Överskott efter avsättningar</td>
                <td className="text-right tabular-nums">{fmt(t.overskottForeAvdrag)} kr</td></tr>
              <tr className="text-muted-foreground">
                <td>− Schablonavdrag egenavgifter ({rules.schablonavdrag} %)</td>
                <td className="text-right tabular-nums">−{fmt(t.schablonavdragBelopp)} kr</td></tr>
              <tr className="border-b"><td>= Beskattningsbar näringsinkomst</td>
                <td className="text-right tabular-nums font-medium">{fmt(t.avgiftsunderlag)} kr</td></tr>
              <tr><td>Egenavgifter ({rules.egenavgifterFull} %{t.nedsattning > 0 ? `, nedsättning −${fmt(t.nedsattning)} kr` : ""})</td>
                <td className="text-right tabular-nums">{fmt(t.egenavgifter)} kr</td></tr>
              <tr><td>Kommunalskatt ({rules.kommunalskattPct} %)</td>
                <td className="text-right tabular-nums">{fmt(t.kommunalskatt)} kr</td></tr>
              {t.statligSkatt > 0 && (
                <tr><td>Statlig skatt (20 % över {fmt(rules.skiktgransStatlig)} kr)</td>
                  <td className="text-right tabular-nums">{fmt(t.statligSkatt)} kr</td></tr>
              )}
              {t.rantefordelningSkatt > 0 && (
                <tr><td>Kapitalskatt på räntefördelning (30 %)</td>
                  <td className="text-right tabular-nums">{fmt(t.rantefordelningSkatt)} kr</td></tr>
              )}
              <tr className="border-t font-semibold">
                <td>Total skatt och avgifter</td>
                <td className="text-right tabular-nums">{fmt(t.totalSkattOchAvgifter)} kr</td></tr>
              <tr className="font-semibold text-green-700">
                <td>Kvar efter skatt (möjligt eget uttag)</td>
                <td className="text-right tabular-nums">{fmt(t.kvarEfterSkatt)} kr</td></tr>
              <tr className="text-muted-foreground">
                <td>Effektiv skattesats</td>
                <td className="text-right tabular-nums">{t.effektivSkattesats.toFixed(1)} %</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">F-skattekoll</CardTitle>
          <CardDescription>
            Betald F-skatt hittills i år (konto 2012): <strong>{fmt(fSkattPaid)} kr</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs space-y-1">
            <Label>Din månatliga debiterade F-skatt (kr)</Label>
            <Input type="number" value={monthlyFSkatt}
              onChange={(e) => setMonthlyFSkatt(e.target.value)} />
          </div>
          {yearlyFSkatt > 0 && (
            <p className="text-sm">
              {fSkattDiff >= 0 ? (
                <>På helår betalar du <strong>{fmt(yearlyFSkatt)} kr</strong> — ca{" "}
                  <strong className="text-green-700">{fmt(fSkattDiff)} kr för mycket</strong>.
                  Överväg att lämna en preliminär inkomstdeklaration och sänka F-skatten.</>
              ) : (
                <>På helår betalar du <strong>{fmt(yearlyFSkatt)} kr</strong> — ca{" "}
                  <strong className="text-destructive">{fmt(-fSkattDiff)} kr för lite</strong>.
                  Höj F-skatten via preliminär inkomstdeklaration för att slippa kvarskatt.</>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

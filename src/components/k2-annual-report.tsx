import { PrintButton } from "@/components/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { K2Report, K2Row } from "@/lib/k2/report";

const fmt = (n: number) => n.toLocaleString("sv-SE");

function RowTable({ rows }: { rows: K2Row[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.bold ? "font-semibold border-t" : ""}>
            <td className="py-1">
              {r.label}
              {r.note ? <sup className="text-muted-foreground ml-1">{r.note}</sup> : null}
            </td>
            <td className="py-1 text-right tabular-nums w-32">{fmt(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Årsredovisning K2 för mindre aktiebolag — utskrivbart dokument */
export function K2AnnualReport({
  year, companyName, orgNumber, city, report,
}: {
  year: number;
  companyName: string;
  orgNumber: string;
  city: string;
  report: K2Report;
}) {
  const balanced = report.balances.assets === report.balances.equityAndLiabilities;
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">Årsredovisning {year} (K2)</h1>
          <p className="text-sm text-muted-foreground">
            Upprättad enligt BFNAR 2016:10 (K2). Granska, skriv ut, underteckna och
            lämna in till Bolagsverket — digital inlämning via bolagsverket.se eller
            på papper. Stäm gärna av med redovisningskonsult första året.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <PrintButton />
          <Button asChild variant="outline" size="sm" className="print:hidden">
            <a href={`/export/sru?year=${year}`}
              title="INK2 + INK2R + INK2S som SRU-filer för Skatteverkets filöverföring">
              SRU-filer (INK2)
            </a>
          </Button>
        </div>
      </div>

      {!balanced && (
        <Card className="border-destructive print:hidden">
          <CardContent className="py-4 text-sm text-destructive">
            ⚠️ Balansräkningen balanserar inte (tillgångar {fmt(report.balances.assets)} kr,
            eget kapital &amp; skulder {fmt(report.balances.equityAndLiabilities)} kr).
            Kontrollera att alla bokslutsposter (avskrivningar, skatt, årets resultat)
            är bokförda innan dokumentet används.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-8 px-8 space-y-8 print:shadow-none print:border-0">
          {/* Titelsida */}
          <div className="text-center space-y-1 pb-4 border-b">
            <div className="text-xl font-bold">Årsredovisning</div>
            <div className="text-lg">{companyName}</div>
            <div className="text-sm text-muted-foreground">Org.nr {orgNumber}</div>
            <div className="text-sm text-muted-foreground">Räkenskapsåret {year}-01-01 – {year}-12-31</div>
          </div>

          {/* Förvaltningsberättelse */}
          <section className="space-y-2">
            <h2 className="font-semibold text-base">Förvaltningsberättelse</h2>
            <h3 className="text-sm font-medium">Verksamheten</h3>
            <p className="text-sm">
              Bolaget bedriver sin verksamhet i {city || "Sverige"}. Styrelsen har sitt
              säte i {city || "Sverige"}. Inga väsentliga händelser har inträffat under
              räkenskapsåret utöver den löpande verksamheten.
            </p>
            <h3 className="text-sm font-medium">Flerårsöversikt (tkr)</h3>
            <table className="text-sm w-full max-w-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th></th><th className="text-right">{year}</th>
              </tr></thead>
              <tbody>
                <tr><td>Nettoomsättning</td><td className="text-right tabular-nums">{fmt(Math.round(report.netRevenue / 1000))}</td></tr>
                <tr><td>Resultat efter finansiella poster</td><td className="text-right tabular-nums">{fmt(Math.round(report.result / 1000))}</td></tr>
                <tr><td>Soliditet (%)</td><td className="text-right tabular-nums">
                  {report.balances.assets > 0 ? Math.round(report.equity.total / report.balances.assets * 100) : 0}
                </td></tr>
              </tbody>
            </table>
            <h3 className="text-sm font-medium">Förändringar i eget kapital (kr)</h3>
            <table className="text-sm w-full max-w-md">
              <tbody>
                <tr><td>Aktiekapital</td><td className="text-right tabular-nums">{fmt(report.equity.shareCapital)}</td></tr>
                <tr><td>Balanserat resultat</td><td className="text-right tabular-nums">{fmt(report.equity.retained)}</td></tr>
                <tr><td>Årets resultat</td><td className="text-right tabular-nums">{fmt(report.equity.yearResult)}</td></tr>
                <tr className="font-semibold border-t"><td>Summa eget kapital</td><td className="text-right tabular-nums">{fmt(report.equity.total)}</td></tr>
              </tbody>
            </table>
            <h3 className="text-sm font-medium">Resultatdisposition</h3>
            <p className="text-sm">
              Till årsstämmans förfogande står {fmt(report.equity.retained + report.equity.yearResult)} kr.
              Styrelsen föreslår att medlen balanseras i ny räkning.
            </p>
          </section>

          {/* Resultaträkning */}
          <section className="space-y-2">
            <h2 className="font-semibold text-base">Resultaträkning (kr)</h2>
            <RowTable rows={report.incomeStatement} />
          </section>

          {/* Balansräkning */}
          <section className="space-y-2">
            <h2 className="font-semibold text-base">Balansräkning (kr)</h2>
            <h3 className="text-sm font-medium">Tillgångar</h3>
            <RowTable rows={report.balanceAssets} />
            <h3 className="text-sm font-medium pt-2">Eget kapital och skulder</h3>
            <RowTable rows={report.balanceEquityLiabilities} />
          </section>

          {/* Noter */}
          <section className="space-y-2">
            <h2 className="font-semibold text-base">Noter</h2>
            <p className="text-sm">
              <b>Not 1 — Redovisningsprinciper.</b> Årsredovisningen är upprättad i
              enlighet med årsredovisningslagen och Bokföringsnämndens allmänna råd
              BFNAR 2016:10 (K2) om årsredovisning i mindre företag. Anläggnings­tillgångar
              skrivs av linjärt över bedömd nyttjandeperiod (5 år).
            </p>
            <p className="text-sm">
              <b>Not 2 — Medelantal anställda.</b> ______ st (fylls i för hand).
            </p>
          </section>

          {/* Underskrift */}
          <section className="space-y-8 pt-4">
            <p className="text-sm">{city || "Ort"}, den ______________________</p>
            <div className="pt-8 border-t max-w-xs">
              <p className="text-sm">Styrelseledamot</p>
            </div>
          </section>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground print:hidden">
        Dokumentet genereras direkt ur bokföringen. Fastställelseintyg och årsstämmo­protokoll
        tillkommer vid inlämning till Bolagsverket. Debet &amp; Kredit är ett verktyg —
        styrelsen ansvarar för årsredovisningens innehåll.
      </p>
    </div>
  );
}

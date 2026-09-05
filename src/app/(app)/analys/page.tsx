import Link from "next/link";
import { Megaphone, Package, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSEK, kronorToOre } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import {
  costByClass, grossMarginByMonth, paretoOf, topWithRest, agingBuckets,
} from "@/lib/analysis-charts";
import {
  GroupedBarChart, LineChart, ParetoChart, HBarChart, ShareBar, ChartLegend, ChartEmpty,
} from "@/components/charts";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

// KPI-avgränsningar per BAS-kontogrupp (gäller alla företag, inga hårdkodade motparter)
const isMarketingAccount = (n: number) => n >= 5900 && n <= 5999; // Reklam och PR
const isGoodsAccount = (n: number) => n >= 4000 && n <= 4999;     // Varor, material, underentreprenader

const sek = (kronor: number) => formatSEK(kronorToOre(kronor));

type Row = {
  account: number; debit: number; credit: number; note: string | null;
  verifications: {
    id: string; number: number; verification_date: string; fiscal_year_id: string;
    description: string; counterparty: string | null; source: string;
  };
};

export default async function AnalysPage() {
  const supabase = await createClient();

  // fetchAll paginerar förbi PostgREST:s tak på 1000 rader. Utan det läser
  // sidan bara den första tusenlappen och tiger om resten: diagrammen ritade
  // "Inga kostnader bokförda det här året" för ett företag med miljoner i
  // kostnader, eftersom de tusen raderna råkade vara intäkter. Ett tyst fel
  // som ser ut som ett svar är värre än inget diagram alls.
  const [rowsRaw, allVers, { data: accountRows },
    { data: fiscalYears }, { data: openInvoices }] = await Promise.all([
    // Upp till 8998: resultatet omfattar även finansiella poster och skatt,
    // men aldrig 8999 (årets resultat) — då räknas resultatet två gånger.
    fetchAll<Row>((f, t) => supabase
      .from("verification_rows")
      .select("account, debit, credit, note, verifications!inner(id, number, verification_date, fiscal_year_id, description, counterparty, source)")
      .gte("account", 3000).lte("account", 8998)
      .order("id").range(f, t) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>),
    fetchAll<{
      id: string; number: number; verification_date: string; description: string | null;
      source: string; attachments: { id: string }[]; verification_series: unknown;
    }>((f, t) => supabase
      .from("verifications")
      .select("id, number, verification_date, description, source, attachments(id), verification_series(code)")
      .neq("source", "correction")
      .order("verification_date", { ascending: false })
      .order("id").range(f, t)),
    supabase.from("accounts").select("number, name").gte("number", 3000).lte("number", 3799),
    supabase.from("fiscal_years").select("id, year, status, start_date").order("year", { ascending: false }),
    supabase.from("invoices").select("id, due_date, total_amount, invoice_payments(amount)")
      .eq("type", "debit").in("status", ["booked", "sent", "partially_paid"]),
  ]);
  const accountName = new Map((accountRows ?? []).map((a) => [a.number, a.name]));

  // Sidan visar ETT räkenskapsår. Utan den avgränsningen hamnade januari 2025
  // och januari 2026 i samma månadskolumn och lades ihop, och KPI-korten sa
  // "i år" om summan av alla år.
  const years = fiscalYears ?? [];
  const fy = years.find((y) => y.status === "open") ?? years[0] ?? null;
  const prevFy = fy
    ? years.filter((y) => y.start_date < fy.start_date)
      .sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null
    : null;

  const allRows = (rowsRaw ?? []) as unknown as Row[];
  const rows = allRows.filter((r) => !fy || r.verifications.fiscal_year_id === fy.id);

  // ---------- Omsättning och resultat per månad, i år och i fjol ----------
  const summaryFor = (yearId: string | undefined) => {
    const revenue = Array(12).fill(0) as number[];
    const result = Array(12).fill(0) as number[];
    if (!yearId) return { revenue, result };
    for (const r of allRows) {
      if (r.verifications.fiscal_year_id !== yearId) continue;
      const m = parseInt(r.verifications.verification_date.slice(5, 7)) - 1;
      const net = Number(r.credit) - Number(r.debit);
      result[m] += net;
      if (r.account >= 3000 && r.account <= 3799) revenue[m] += net;
    }
    return { revenue, result };
  };
  const thisYear = summaryFor(fy?.id);
  const lastYear = summaryFor(prevFy?.id);
  const hasYearChart = [...thisYear.revenue, ...thisYear.result, ...lastYear.revenue]
    .some((v) => v !== 0);

  // ---------- Kostnader per motpart × månad ----------
  const costByParty = new Map<string, { months: number[]; total: number }>();
  const monthsWithData = new Set<number>();
  for (const r of rows) {
    // Kostnadstabellen är rörelsens kostnader — klass 8 (ränta, skatt) hör
    // hemma i resultatlinjen ovan, inte bland leverantörerna.
    if (r.account < 4000 || r.account > 7999) continue;
    const amount = Number(r.debit) - Number(r.credit);
    if (amount === 0) continue;
    const party = r.verifications.counterparty ?? "(utan motpart)";
    const m = parseInt(r.verifications.verification_date.slice(5, 7)) - 1;
    monthsWithData.add(m);
    const e = costByParty.get(party) ?? { months: Array(12).fill(0), total: 0 };
    e.months[m] += amount; e.total += amount;
    costByParty.set(party, e);
  }
  const months = [...monthsWithData].sort((a, b) => a - b);
  const costRows = [...costByParty.entries()].sort((a, b) => b[1].total - a[1].total);
  const costTotal = costRows.reduce((s, [, e]) => s + e.total, 0);

  // ---------- Försäljning per kund & tjänst ----------
  const byCustomer = new Map<string, { total: number; count: Set<string> }>();
  const byService = new Map<string, { total: number; count: Set<string> }>();
  const marketingCost = { total: 0 };
  const goodsCost = { total: 0 };
  let revenueTotal = 0;
  const salesVerIds = new Set<string>();
  // Underlag till diagrammen: kostnad per kontoklass, och omsättning respektive
  // varukostnad per månad för bruttomarginalen
  const costRowsForClass: { account: number; amount: number }[] = [];
  const revenuePerMonth = Array(12).fill(0) as number[];
  const cogsPerMonth = Array(12).fill(0) as number[];

  for (const r of rows) {
    const v = r.verifications;
    const month = parseInt(v.verification_date.slice(5, 7)) - 1;
    if (r.account >= 3000 && r.account <= 3799) {
      const amount = Number(r.credit) - Number(r.debit);
      revenueTotal += amount;
      revenuePerMonth[month] += amount;
      if (v.source !== "correction") salesVerIds.add(v.id);
      const cust = v.counterparty ?? "(okänd kund)";
      const c = byCustomer.get(cust) ?? { total: 0, count: new Set() };
      c.total += amount; c.count.add(v.id); byCustomer.set(cust, c);
      const cat = `${r.account} ${accountName.get(r.account) ?? ""}`.trim();
      const sv = byService.get(cat) ?? { total: 0, count: new Set() };
      sv.total += amount; sv.count.add(v.id); byService.set(cat, sv);
    } else if (r.account >= 4000 && r.account <= 7999) {
      const amount = Number(r.debit) - Number(r.credit);
      costRowsForClass.push({ account: r.account, amount });
      if (isMarketingAccount(r.account)) marketingCost.total += amount;
      if (isGoodsAccount(r.account)) {
        goodsCost.total += amount;
        cogsPerMonth[month] += amount;
      }
    }
  }
  const salesCount = salesVerIds.size;
  const custRows = [...byCustomer.entries()].sort((a, b) => b[1].total - a[1].total);
  const svcRows = [...byService.entries()].sort((a, b) => b[1].total - a[1].total);

  const costClasses = costByClass(costRowsForClass);
  const margin = grossMarginByMonth(revenuePerMonth, cogsPerMonth);
  const hasMargin = margin.some((m) => m !== null);
  const topSuppliers = topWithRest(costRows.map(([name, e]) => [name, e.total] as const));
  const customerPareto = paretoOf(custRows.map(([name, c]) => [name, c.total] as const));
  // Hur många kunder som krävs för att nå 80 % — koncentrationsrisken i en siffra
  const to80 = customerPareto.items.findIndex((i) => i.cumulative >= 0.8) + 1;

  const today = todayISO();
  const aging = agingBuckets(
    (openInvoices ?? []).map((inv) => ({
      dueDate: inv.due_date,
      outstanding: Number(inv.total_amount)
        - (inv.invoice_payments ?? []).reduce((s, p) => s + Number(p.amount), 0),
    })),
    today,
  );
  const agingTotal = aging.reduce((s, b) => s + b.value, 0);
  const overdueTotal = aging.filter((b) => b.overdue).reduce((s, b) => s + b.value, 0);

  // ---------- Underlagsjakt ----------
  const missing = (allVers ?? []).filter((v) => (v.attachments as { id: string }[]).length === 0);

  const kpis = [
    {
      title: "Marknadsföring i år", icon: Megaphone,
      value: kronorToOre(marketingCost.total),
      sub: salesCount > 0 ? `${formatSEK(kronorToOre(marketingCost.total / salesCount))} per affär (CAC)` : "inga affärer ännu",
    },
    {
      title: "Varor & underentreprenader i år", icon: Package,
      value: kronorToOre(goodsCost.total),
      sub: salesCount > 0 ? `${formatSEK(kronorToOre(goodsCost.total / salesCount))} per affär (kontoklass 4)` : "",
    },
    {
      // Arkiveringsplikten är sju år — den här listan är medvetet inte
      // avgränsad till räkenskapsåret, till skillnad från resten av sidan.
      title: "Verifikat utan underlag (alla år)", icon: Paperclip,
      value: null as number | null,
      raw: `${missing.length} st`,
      sub: missing.length ? "arkiveringsplikt 7 år — komplettera nedan" : "allt komplett",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Analys</h1>
        <p className="text-sm text-muted-foreground">
          {fy ? `Räkenskapsåret ${fy.year}` : "Ingen bokföring ännu"} — omsättning och
          resultat, vart pengarna går, vilka kunder och leverantörer som väger tyngst.
          Alla belopp exkl. moms.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <Card key={k.title}>
            <CardContent className="pt-4 flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{k.title}</div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {k.value !== null ? formatSEK(k.value) : k.raw}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{k.sub}</div>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <k.icon className="h-4.5 w-4.5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omsättning och resultat, månad för månad</CardTitle>
          <CardDescription>
            {prevFy
              ? `Staplarna är omsättningen — ${fy?.year} i fullton, ${prevFy.year} nedtonat bakom. Linjen är årets resultat.`
              : "Staplarna är omsättningen, linjen resultatet. Jämförelsen mot föregående år dyker upp när det finns ett."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasYearChart ? (
            <>
              <GroupedBarChart
                labels={MONTH_LABELS}
                series={[
                  { label: `Omsättning ${fy?.year ?? ""}`.trim(), values: thisYear.revenue, color: "chart-1" },
                  ...(prevFy
                    ? [{ label: `Omsättning ${prevFy.year}`, values: lastYear.revenue, color: "chart-2" as const, faded: true }]
                    : []),
                ]}
                line={{ label: "Resultat", values: thisYear.result, color: "chart-3" }}
              />
              <ChartLegend items={[
                { label: `Omsättning ${fy?.year ?? ""}`.trim(), color: "chart-1" },
                ...(prevFy ? [{ label: `Omsättning ${prevFy.year}`, color: "chart-2" as const, faded: true }] : []),
                { label: "Resultat", color: "chart-3" },
              ]} />
            </>
          ) : (
            <ChartEmpty>
              Inga bokförda intäkter eller kostnader ännu. Diagrammet fylls i av sig självt
              när första verifikatet är bokfört.
            </ChartEmpty>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vart pengarna går</CardTitle>
            <CardDescription>
              Årets kostnader fördelade på BAS-kontoklass — vilken sorts utgift som
              faktiskt tar mest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {costClasses.segments.length ? (
              <ShareBar segments={costClasses.segments} />
            ) : (
              <ChartEmpty>Inga kostnader bokförda på konto 4000–7999 det här året.</ChartEmpty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bruttomarginal per månad</CardTitle>
            <CardDescription>
              Omsättning minus varor och material (kontoklass 4), i procent av
              omsättningen. Månader utan försäljning ritas inte alls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasMargin ? (
              <LineChart labels={MONTH_LABELS} values={margin} unit="percent" color="chart-1" />
            ) : (
              <ChartEmpty>Ingen försäljning bokförd ännu — marginalen går inte att räkna.</ChartEmpty>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Största kostnadsposterna</CardTitle>
            <CardDescription>
              Årets tio största motparter på kostnadssidan. Samma siffror som tabellen
              nedan, men i storleksordning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topSuppliers.length ? (
              <HBarChart
                items={topSuppliers.map((i) => ({ ...i, muted: i.label.startsWith("Övriga ") }))}
              />
            ) : (
              <ChartEmpty>Inga kostnader bokförda det här året.</ChartEmpty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kundkoncentration</CardTitle>
            <CardDescription>
              {customerPareto.items.length && to80 > 0
                ? `${to80} ${to80 === 1 ? "kund står" : "kunder står"} för 80 % av omsättningen. Ju färre, desto mer hänger företaget på dem.`
                : "Hur omsättningen fördelar sig på kunderna."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customerPareto.items.length ? (
              <ParetoChart items={customerPareto.items} />
            ) : (
              <ChartEmpty>Ingen försäljning bokförd ännu.</ChartEmpty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kundfordringar efter ålder</CardTitle>
          <CardDescription>
            Obetalda kundfakturor, grupperade efter hur länge de har varit förfallna.
            {overdueTotal > 0
              ? ` ${sek(overdueTotal)} av ${sek(agingTotal)} är förfallet.`
              : agingTotal > 0
                ? " Ingenting är förfallet."
                : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agingTotal > 0 ? (
            <HBarChart
              items={aging.filter((b) => b.value > 0).map((b) => ({
                label: `${b.label} (${b.count} st)`, value: b.value, muted: !b.overdue,
              }))}
              href="/fakturor"
            />
          ) : (
            <ChartEmpty>Inga obetalda kundfakturor just nu.</ChartEmpty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kostnader per leverantör och månad</CardTitle></CardHeader>
        <CardContent>
          {/* Bred tabell: skrollar inuti kortet, första kolumnen ligger fast.
              Utan min-w-max klämdes månadskolumnerna ihop på telefon. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm whitespace-nowrap">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="sticky left-0 z-10 bg-card text-left py-1.5 pr-4 font-medium">Leverantör/motpart</th>
                  {months.map((m) => (
                    <th key={m} className="text-right py-1.5 font-medium">{MONTH_LABELS[m]}</th>
                  ))}
                  <th className="text-right py-1.5 font-medium">Totalt</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {costRows.map(([party, e]) => (
                  <tr key={party}>
                    <td className="sticky left-0 z-10 bg-card py-1.5 pr-4 max-w-56 truncate" title={party}>{party}</td>
                    {months.map((m) => (
                      <td key={m} className="text-right py-1.5 tabular-nums text-muted-foreground">
                        {e.months[m] !== 0 ? formatSEK(kronorToOre(e.months[m])) : "—"}
                      </td>
                    ))}
                    <td className="text-right py-1.5 tabular-nums font-medium">{formatSEK(kronorToOre(e.total))}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="sticky left-0 z-10 bg-card py-1.5 pr-4">Totalt</td>
                  {months.map((m) => (
                    <td key={m} className="text-right py-1.5 tabular-nums">
                      {formatSEK(kronorToOre(costRows.reduce((s, [, e]) => s + e.months[m], 0)))}
                    </td>
                  ))}
                  <td className="text-right py-1.5 tabular-nums">{formatSEK(kronorToOre(costTotal))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Försäljning per kund</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1.5 font-medium">Kund</th>
                  <th className="text-right py-1.5 font-medium">Affärer</th>
                  <th className="text-right py-1.5 font-medium">Exkl. moms</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {custRows.map(([name, c]) => (
                  <tr key={name}>
                    <td className="py-1.5 truncate max-w-44">{name}</td>
                    <td className="text-right py-1.5 tabular-nums">{c.count.size}</td>
                    <td className="text-right py-1.5 tabular-nums">{formatSEK(kronorToOre(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Försäljning per intäktskonto</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1.5 font-medium">Tjänst</th>
                  <th className="text-right py-1.5 font-medium">Affärer</th>
                  <th className="text-right py-1.5 font-medium">Exkl. moms</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {svcRows.map(([cat, c]) => (
                  <tr key={cat}>
                    <td className="py-1.5">{cat}</td>
                    <td className="text-right py-1.5 tabular-nums">{c.count.size}</td>
                    <td className="text-right py-1.5 tabular-nums">{formatSEK(kronorToOre(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">
              Total omsättning: {formatSEK(kronorToOre(revenueTotal))} · {salesCount} affärer
            </p>
          </CardContent>
        </Card>
      </div>

      {missing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verifikat som saknar underlag ({missing.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {missing.slice(0, 12).map((v) => (
                <li key={v.id} className="py-1.5 flex justify-between gap-2">
                  <Link href={`/verifikat/${v.id}`} className="hover:underline truncate">
                    <span className="font-mono text-muted-foreground mr-2">
                      {(v.verification_series as unknown as { code: string })?.code}{v.number}
                    </span>
                    {v.description}
                  </Link>
                  <span className="text-muted-foreground shrink-0">{v.verification_date}</span>
                </li>
              ))}
            </ul>
            {missing.length > 12 && (
              <p className="text-xs text-muted-foreground mt-2">…och {missing.length - 12} till.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

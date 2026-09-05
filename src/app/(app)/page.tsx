import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { taxDeadlines, needsFTaxAnswer, F_TAX_PROMPT, TAX_CALENDAR_SOURCE } from "@/lib/tax-calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GettingStarted } from "@/components/getting-started";
import { MonthlyChart } from "@/components/monthly-chart";
import { DashboardWidgets } from "@/components/dashboard-widgets";
import { DEFAULT_WIDGETS, sanitizeWidgetIds, type WidgetMetrics } from "@/lib/widgets";
import { kronorToOre } from "@/lib/money";
import { todayISO } from "@/lib/dates";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { data: fy }, { data: balances }, { data: recent }, { data: settings },
    { data: vatReports }, { data: openInvoices }, { data: openSupplierInvoices },
    { count: customerCount }, { count: articleCount }, { count: invoiceCount },
    { count: verCount }, { count: bankTxCount }, { data: resultEntries },
    { data: salesVers }, { data: attachCheck },
  ] = await Promise.all([
    supabase.from("fiscal_years").select("*").eq("status", "open")
      .order("year", { ascending: false }).limit(1).single(),
    supabase.from("account_balances").select("*"),
    supabase.from("verifications")
      .select("id, verification_date, description, number, verification_series(code)")
      .order("registered_at", { ascending: false }).limit(6),
    supabase.from("settings")
      .select("vat_period, eu_trade, org_number, bankgiro, dashboard_widgets, dismissed_checklist_steps, checklist_hidden, pays_f_tax")
      .eq("id", 1).single(),
    supabase.from("vat_reports").select("period_start, status"),
    supabase.from("invoices").select("id, due_date, total_amount, invoice_payments(amount)")
      .in("status", ["booked", "sent", "partially_paid"]).eq("type", "debit"),
    supabase.from("supplier_invoices").select("id, due_date").neq("status", "paid"),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase.from("invoices").select("id", { count: "exact", head: true }),
    supabase.from("verifications").select("id", { count: "exact", head: true }),
    supabase.from("bank_transactions").select("id", { count: "exact", head: true }),
    supabase.from("ledger_entries").select("verification_date, debit, credit, account")
      .gte("account", 3000).lte("account", 8998),
    supabase.from("verifications")
      .select("id, verification_rows!inner(account)")
      .neq("source", "correction")
      .gte("verification_rows.account", 3000).lte("verification_rows.account", 3799),
    supabase.from("verifications")
      .select("id, attachments(id)")
      .neq("source", "correction"),
  ]);
  const today = todayISO();
  const bal = balances ?? [];
  const bankSaldo = bal.filter((b) => b.account! >= 1910 && b.account! <= 1940)
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);
  const resultat = bal.filter((b) => b.class! >= 3 && b.account !== 8999)
    .reduce((s, b) => s - kronorToOre(Number(b.balance)), 0);
  const uttag = bal.filter((b) => [2011, 2012, 2013].includes(b.account!))
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);

  // Månatligt resultat + omsättning för diagram och KPI:er
  const monthly = MONTH_LABELS.map((label) => ({ label, value: 0 }));
  const monthlyRevenue = MONTH_LABELS.map((label) => ({ label, value: 0 }));
  let revenueYear = 0;
  for (const e of resultEntries ?? []) {
    const m = parseInt(e.verification_date!.slice(5, 7)) - 1;
    const net = Number(e.credit) - Number(e.debit);
    monthly[m].value += net;
    if (e.account! >= 3000 && e.account! <= 3799) {
      monthlyRevenue[m].value += net;
      revenueYear += net;
    }
  }
  const hasChartData = monthly.some((m) => m.value !== 0);
  const thisMonth = new Date().getMonth();
  const revenueThisMonth = monthlyRevenue[thisMonth].value;
  const revenuePrevMonth = thisMonth > 0 ? monthlyRevenue[thisMonth - 1].value : 0;
  const growth = revenuePrevMonth > 0
    ? Math.round(((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100)
    : null;
  // Antal affärer = unika verifikat med intäktsrad (exkl rättelser); snittorder på positiva belopp
  const salesCount = new Set((salesVers ?? []).map((v) => v.id)).size;
  const avgOrder = salesCount > 0 ? revenueYear / salesCount : 0;

  // Kom igång-checklistan (Fortnox-mönstret) — bortklickade steg filtreras bort
  const dismissedSteps = new Set(
    Array.isArray(settings?.dismissed_checklist_steps) ? settings.dismissed_checklist_steps : []);
  const checklist = settings?.checklist_hidden ? [] : [
    {
      id: "company_info",
      label: "Fyll i företagsuppgifterna",
      done: !!settings?.org_number && !!settings?.bankgiro,
      href: "/installningar",
      hint: "Personnummer och bankgiro krävs på fakturorna",
    },
    {
      id: "first_customer",
      label: "Lägg upp din första kund",
      done: (customerCount ?? 0) > 0,
      href: "/kunder",
      hint: "Namn och e-post räcker",
    },
    {
      id: "first_article",
      label: "Skapa en artikel",
      done: (articleCount ?? 0) > 0,
      href: "/artiklar",
      hint: "T.ex. ditt timarvode",
    },
    {
      id: "first_invoice",
      label: "Skicka din första faktura",
      done: (invoiceCount ?? 0) > 0,
      href: "/fakturor/ny",
      hint: "Bokförs automatiskt med moms",
    },
    {
      id: "first_verification",
      label: "Bokför en händelse",
      done: (verCount ?? 0) > 0,
      href: "/verifikat/ny",
      hint: "Prova en snabbhändelse — t.ex. eget uttag",
    },
    {
      id: "bank",
      label: "Koppla banken eller importera CSV",
      done: (bankTxCount ?? 0) > 0,
      href: "/bank",
      hint: "Transaktionerna matchas mot fakturor automatiskt",
    },
  ].filter((s) => !dismissedSteps.has(s.id));

  // Att göra-listan
  const overdueInvoices = (openInvoices ?? []).filter((i) => i.due_date < today);
  const dueSuppliers = (openSupplierInvoices ?? []).filter((i) => i.due_date <= today);
  const upcoming = taxDeadlines(
    fy?.year ?? 2026,
    (settings?.vat_period ?? "kvartal") as "manad" | "kvartal" | "helar",
    settings?.eu_trade ?? false,
    settings?.pays_f_tax
  ).filter((d) => {
    if (d.dueDate < today) return false;
    if (d.type === "moms" && d.periodStart) {
      const r = (vatReports ?? []).find((x) => x.period_start === d.periodStart);
      if (r?.status === "approved") return false;
    }
    return true;
  }).slice(0, 5);

  const missingAttachments = (attachCheck ?? [])
    .filter((v) => (v.attachments as { id: string }[]).length === 0).length;

  // F-skattefrågan obesvarad: hellre en rad som ber om svaret än tolv datum
  // som programmet gissat fram åt någon som kanske inte har F-skatt alls.
  const askFTax = needsFTaxAnswer(settings?.pays_f_tax);

  const daysUntil = (date: string) =>
    Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / 86400000);

  // Widgetdata — alla tillgängliga nyckeltal (klienten visar de valda)
  const vatDebt = bal.filter((b) => b.account! >= 2600 && b.account! <= 2699)
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);
  const costsYear = bal.filter((b) => b.account! >= 4000 && b.account! <= 7999)
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);
  const unpaidSum = (openInvoices ?? []).reduce((s, i) => {
    const paid = ((i.invoice_payments ?? []) as { amount: number }[])
      .reduce((p, x) => p + Number(x.amount), 0);
    return s + kronorToOre(Number(i.total_amount) - paid);
  }, 0);
  const grossMargin = revenueYear > 0
    ? ((revenueYear - bal.filter((b) => b.account! >= 4000 && b.account! <= 4999)
        .reduce((s, b) => s + Number(b.balance), 0)) / revenueYear) * 100
    : null;

  const metrics: WidgetMetrics = {
    revenue_year: { ore: kronorToOre(revenueYear), sub: "exkl. moms", href: "/analys" },
    revenue_month: {
      ore: kronorToOre(revenueThisMonth),
      sub: growth === null ? "första månaden med försäljning"
        : `${growth >= 0 ? "+" : ""}${growth} % mot ${MONTH_LABELS[thisMonth - 1].toLowerCase()}`,
      href: "/analys",
    },
    avg_order: { ore: kronorToOre(avgOrder), sub: `${salesCount} affärer i år` },
    bank_cash: { ore: bankSaldo, sub: "enligt bokföringen", href: "/avstamning" },
    result_year: { ore: resultat, sub: `räkenskapsår ${fy?.year ?? ""}`, href: "/rapporter/resultat" },
    own_withdrawals: { ore: uttag, sub: "inkl. F-skatt", href: "/skatt" },
    vat_debt: { ore: -vatDebt, sub: "netto på momskontona", href: "/moms" },
    unpaid_invoices: {
      text: `${(openInvoices ?? []).length} st`,
      sub: unpaidSum > 0 ? `${Math.round(unpaidSum / 100).toLocaleString("sv-SE")} kr utestående` : "inga utestående",
      href: "/fakturor",
    },
    costs_year: { ore: costsYear, sub: "klass 4–7, exkl. moms", href: "/analys" },
    gross_margin: grossMargin !== null
      ? { text: `${grossMargin.toFixed(1).replace(".", ",")} %`, sub: "efter direkta kostnader", href: "/analys" }
      : { text: "—", sub: "ingen försäljning ännu" },
    verifikat_count: { text: `${verCount ?? 0} st`, sub: "i obruten serie", href: "/verifikat" },
  };
  const chosenWidgets = sanitizeWidgetIds(settings?.dashboard_widgets) ?? DEFAULT_WIDGETS;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Översikt</h1>
          <p className="text-sm text-muted-foreground">Räkenskapsår {fy?.year ?? "—"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/analys">Analys</Link></Button>
          <Button variant="outline" asChild><Link href="/underlag">Underlagsinkorg</Link></Button>
          <Button asChild><Link href="/verifikat/ny">Ny verifikation</Link></Button>
        </div>
      </div>

      <GettingStarted items={checklist} />

      <DashboardWidgets widgets={chosenWidgets} metrics={metrics} />

      {hasChartData && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Omsättning per månad</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyChart months={monthlyRevenue} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Resultat per månad</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyChart months={monthly} />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Att göra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overdueInvoices.length > 0 && (
              <Link href="/fakturor" className="flex justify-between hover:underline">
                <span>{overdueInvoices.length} förfallna kundfakturor att påminna</span>
              </Link>
            )}
            {missingAttachments > 0 && (
              <Link href="/analys" className="flex justify-between hover:underline">
                <span>{missingAttachments} verifikat saknar underlag</span>
              </Link>
            )}
            {dueSuppliers.length > 0 && (
              <Link href="/leverantorer" className="flex justify-between hover:underline">
                <span>{dueSuppliers.length} leverantörsfakturor att betala</span>
              </Link>
            )}
            {upcoming.map((d) => (
              <Link key={d.title + d.dueDate}
                href={d.type === "moms" ? "/moms" : d.type === "inkomstdeklaration" ? "/arsavslut" : "/skatt"}
                className="flex justify-between gap-2 hover:underline">
                <span>
                  {d.title}
                </span>
                <Badge variant={daysUntil(d.dueDate) <= 7 ? "destructive" : "outline"}>
                  {d.dueDate} ({daysUntil(d.dueDate)} dgr)
                </Badge>
              </Link>
            ))}
            {askFTax && (
              <Link href={F_TAX_PROMPT.href} className="flex justify-between gap-2 hover:underline">
                <span className="text-muted-foreground">{F_TAX_PROMPT.text}</span>
              </Link>
            )}
            {overdueInvoices.length === 0 && dueSuppliers.length === 0
              && missingAttachments === 0 && upcoming.length === 0 && !askFTax && (
              <p className="text-muted-foreground">Allt är i fas.</p>
            )}
            {/* Skattedatumen är härledda, inte inlagda — säg det, så ingen tror
                att någon lagt in dem åt dem. */}
            <p className="pt-1 text-xs text-muted-foreground"
              title="Momsperioden, EU-handeln och F-skattesvaret under Inställningar avgör vilka datum som visas här.">
              {TAX_CALENDAR_SOURCE}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Senaste verifikat</CardTitle>
          </CardHeader>
          <CardContent>
            {!recent?.length ? (
              <p className="text-sm text-muted-foreground">
                Inga verifikat ännu. Börja med att bokföra din första händelse.
              </p>
            ) : (
              <ul className="divide-y">
                {recent.map((v) => (
                  <li key={v.id} className="py-2 flex justify-between text-sm">
                    <Link href={`/verifikat/${v.id}`} className="hover:underline truncate">
                      <span className="font-mono text-muted-foreground mr-2">
                        {(v.verification_series as unknown as { code: string })?.code}{v.number}
                      </span>
                      {v.description}
                    </Link>
                    <span className="text-muted-foreground shrink-0 ml-2">{v.verification_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

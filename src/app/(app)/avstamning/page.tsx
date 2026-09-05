import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BankReconciliation } from "@/components/bank-reconciliation";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ReconciliationPage() {
  const supabase = await createClient();

  const [
    { data: fy }, { data: balances }, { data: openInvoices },
    { data: openSupplier }, { data: vatReports }, { data: locks },
    { data: noAttach }, inboxCount, { data: unbookedTrips }, { data: drafts },
  ] = await Promise.all([
    supabase.from("fiscal_years").select("*").eq("status", "open")
      .order("year", { ascending: false }).limit(1).single(),
    supabase.from("account_balances").select("*"),
    supabase.from("invoices").select("total_amount, invoice_payments(amount)")
      .in("status", ["booked", "sent", "partially_paid"]).eq("type", "debit"),
    supabase.from("supplier_invoices").select("total_amount, supplier_payments(amount)")
      .neq("status", "paid"),
    supabase.from("vat_reports").select("period_start, period_end, status"),
    supabase.from("period_locks").select("month, reason"),
    supabase.from("verifications").select("id, attachments(id)")
      .in("source", ["manual", "quick_event", "supplier_invoice"]),
    supabase.from("attachments").select("id", { count: "exact", head: true })
      .is("verification_id", null),
    supabase.from("trips").select("id").is("verification_id", null),
    supabase.from("invoices").select("id").eq("status", "draft"),
  ]);

  const bal = balances ?? [];
  const saldo = (acc: number) =>
    bal.filter((b) => b.account === acc).reduce((s, b) => s + Number(b.balance), 0);
  const saldoRange = (from: number, to: number) =>
    bal.filter((b) => b.account! >= from && b.account! <= to)
      .reduce((s, b) => s + Number(b.balance), 0);

  // Reskontraavstämning
  const arOpen = (openInvoices ?? []).reduce((s, i) => {
    const paid = ((i.invoice_payments ?? []) as { amount: number }[])
      .reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(i.total_amount) - paid;
  }, 0);
  const apOpen = (openSupplier ?? []).reduce((s, i) => {
    const paid = ((i.supplier_payments ?? []) as { amount: number }[])
      .reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(i.total_amount) - paid;
  }, 0);
  const arDiff = saldo(1510) - arOpen;
  const apDiff = -saldo(2440) - apOpen;

  // Moms: momskonton ska vara nollställda för momslåsta månader
  const vatAccountsBalance = saldoRange(2610, 2649);
  const lockedByVat = (locks ?? []).filter((l) => l.reason === "vat_report").length;
  const vatPayable = Math.abs(saldo(2650)) < 0.005 ? 0 : -saldo(2650);

  // Balanskontroll: tillgångar = EK + skulder + beräknat resultat
  const tillgangar = saldoRange(1000, 1999);
  const ekSkulder = -saldoRange(2000, 2999);
  const beraknatResultat = -saldoRange(3000, 8999);
  const balansDiff = tillgangar - ekSkulder - beraknatResultat;

  const missingAttachments = (noAttach ?? []).filter(
    (v) => !(v.attachments as { id: string }[])?.length).length;

  type Check = {
    title: string;
    detail: string;
    value?: string;
    ok: boolean;
    warn?: boolean;
    href: string;
  };

  const checks: Check[] = [
    {
      title: "Balanskontroll",
      detail: "Tillgångar = eget kapital + skulder + beräknat resultat",
      value: Math.abs(balansDiff) < 0.005 ? "Stämmer på öret" : `Differens ${fmt(balansDiff)} kr`,
      ok: Math.abs(balansDiff) < 0.005,
      href: "/rapporter/balans",
    },
    {
      title: "Kundreskontra mot konto 1510",
      detail: `Huvudbok ${fmt(saldo(1510))} kr · Öppna fakturor ${fmt(arOpen)} kr`,
      value: Math.abs(arDiff) < 0.005 ? "Stämmer" : `Differens ${fmt(arDiff)} kr`,
      ok: Math.abs(arDiff) < 0.005,
      href: "/fakturor",
    },
    {
      title: "Leverantörsreskontra mot konto 2440",
      detail: `Huvudbok ${fmt(-saldo(2440))} kr · Öppna fakturor ${fmt(apOpen)} kr`,
      value: Math.abs(apDiff) < 0.005 ? "Stämmer" : `Differens ${fmt(apDiff)} kr`,
      ok: Math.abs(apDiff) < 0.005,
      href: "/leverantorer",
    },
    {
      title: "Momskonton (2610–2649)",
      detail: lockedByVat > 0
        ? `${lockedByVat} månader momsredovisade — kvarvarande saldo avser oredovisade perioder`
        : "Inga momsredovisade perioder ännu",
      value: `Saldo ${fmt(vatAccountsBalance)} kr`,
      ok: true,
      warn: false,
      href: "/moms",
    },
    {
      title: "Momsskuld (2650)",
      detail: vatPayable > 0.005
        ? "Godkänd men obetald moms — betalas senast deklarationsdagen"
        : "Ingen obetald redovisad moms",
      value: `${fmt(vatPayable)} kr`,
      ok: vatPayable < 0.005,
      warn: vatPayable > 0.005,
      href: "/moms",
    },
    {
      title: "Underlag på verifikat",
      detail: "Kvitton/fakturor kopplade till manuellt bokförda händelser (BFL 5:7)",
      value: missingAttachments === 0 ? "Komplett" : `${missingAttachments} verifikat saknar underlag`,
      ok: missingAttachments === 0,
      warn: missingAttachments > 0,
      href: "/verifikat",
    },
    {
      title: "Underlagsinkorgen",
      detail: "Uppladdade men obokförda underlag",
      value: (inboxCount.count ?? 0) === 0 ? "Tom" : `${inboxCount.count} obokförda filer`,
      ok: (inboxCount.count ?? 0) === 0,
      warn: (inboxCount.count ?? 0) > 0,
      href: "/underlag",
    },
    {
      title: "Körjournalen",
      detail: "Resor som väntar på milersättningsbokning",
      value: (unbookedTrips ?? []).length === 0 ? "Klart" : `${(unbookedTrips ?? []).length} obokade resor`,
      ok: (unbookedTrips ?? []).length === 0,
      warn: (unbookedTrips ?? []).length > 0,
      href: "/korjournal",
    },
    {
      title: "Fakturautkast",
      detail: "Osparade fakturor utan fakturanummer",
      value: (drafts ?? []).length === 0 ? "Inga" : `${(drafts ?? []).length} utkast`,
      ok: (drafts ?? []).length === 0,
      warn: (drafts ?? []).length > 0,
      href: "/fakturor",
    },
  ];

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Avstämning</h1>
        <p className="text-sm text-muted-foreground">
          Löpande kontroller av att bokföringen, reskontrorna och momsen hänger ihop —
          räkenskapsår {fy?.year}.
        </p>
      </div>

      <BankReconciliation bookBalance={saldoRange(1910, 1949)} />

      <div className="space-y-2">
        {checks.map((c) => (
          <Link key={c.title} href={c.href} className="block">
            <Card className="hover:bg-accent/40 transition-colors">
              <CardContent className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">
                    {c.ok ? "✓" : c.warn ? "!" : "✕"} {c.title}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
                <Badge variant={c.ok ? "outline" : c.warn ? "secondary" : "destructive"}
                  className="shrink-0 tabular-nums">
                  {c.value}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Momsredovisade perioder</CardTitle>
          <CardDescription>Godkända momsrapporter med låsta perioder.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {(vatReports ?? []).filter((r) => r.status === "approved").length === 0 ? (
            <p className="text-muted-foreground">Inga godkända momsrapporter ännu.</p>
          ) : (
            <ul className="space-y-1">
              {(vatReports ?? []).filter((r) => r.status === "approved").map((r) => (
                <li key={r.period_start}>
                  ✓ {r.period_start} – {r.period_end}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

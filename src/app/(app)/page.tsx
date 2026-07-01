import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { taxDeadlines } from "@/lib/tax-calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSEK, kronorToOre } from "@/lib/money";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { data: fy }, { data: balances }, { data: recent }, { data: settings },
    { data: vatReports }, { data: openInvoices }, { data: openSupplierInvoices },
    { data: inboxFiles },
  ] = await Promise.all([
    supabase.from("fiscal_years").select("*").eq("status", "open")
      .order("year", { ascending: false }).limit(1).single(),
    supabase.from("account_balances").select("*"),
    supabase.from("verifications")
      .select("id, verification_date, description, number, verification_series(code)")
      .order("registered_at", { ascending: false }).limit(6),
    supabase.from("settings").select("vat_period, eu_trade").eq("id", 1).single(),
    supabase.from("vat_reports").select("period_start, status"),
    supabase.from("invoices").select("id, invoice_no, due_date, total_amount, customer_snapshot, invoice_payments(amount)")
      .in("status", ["booked", "sent", "partially_paid"]).eq("type", "debit"),
    supabase.from("supplier_invoices").select("id, due_date, total_amount, suppliers(name)")
      .neq("status", "paid"),
    supabase.from("attachments").select("id", { count: "exact", head: true })
      .is("verification_id", null),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const bal = balances ?? [];
  const bankSaldo = bal.filter((b) => b.account! >= 1910 && b.account! <= 1940)
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);
  const resultat = bal.filter((b) => b.class! >= 3)
    .reduce((s, b) => s - kronorToOre(Number(b.balance)), 0);
  const uttag = bal.filter((b) => [2011, 2012, 2013].includes(b.account!))
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);

  // Att göra-lista
  const overdueInvoices = (openInvoices ?? []).filter((i) => i.due_date < today);
  const dueSuppliers = (openSupplierInvoices ?? []).filter((i) => i.due_date <= today);
  const upcoming = taxDeadlines(
    fy?.year ?? 2026,
    (settings?.vat_period ?? "kvartal") as "manad" | "kvartal" | "helar",
    settings?.eu_trade ?? false
  ).filter((d) => {
    if (d.dueDate < today) return false;
    if (d.type === "moms" && d.periodStart) {
      const r = (vatReports ?? []).find((x) => x.period_start === d.periodStart);
      if (r?.status === "approved") return false;
    }
    return true;
  }).slice(0, 5);

  const daysUntil = (date: string) =>
    Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / 86400000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Översikt</h1>
          <p className="text-sm text-muted-foreground">Räkenskapsår {fy?.year ?? "—"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/fakturor/ny">Ny faktura</Link></Button>
          <Button asChild><Link href="/verifikat/ny">Ny verifikation</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bank & kassa (enligt bokföringen)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatSEK(bankSaldo)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Resultat hittills i år
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatSEK(resultat)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Egna uttag i år (inkl. F-skatt)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatSEK(uttag)}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Att göra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overdueInvoices.length > 0 && (
              <Link href="/fakturor" className="flex justify-between hover:underline">
                <span>🔴 {overdueInvoices.length} förfallna kundfakturor att påminna</span>
              </Link>
            )}
            {dueSuppliers.length > 0 && (
              <Link href="/leverantorer" className="flex justify-between hover:underline">
                <span>💸 {dueSuppliers.length} leverantörsfakturor att betala</span>
              </Link>
            )}
            {(inboxFiles as unknown as { count?: number } | null) && false}
            {upcoming.map((d) => (
              <Link key={d.title + d.dueDate}
                href={d.type === "moms" ? "/moms" : d.type === "inkomstdeklaration" ? "/arsavslut" : "/skatt"}
                className="flex justify-between gap-2 hover:underline">
                <span>
                  {d.type === "moms" ? "🧾" : d.type === "f_skatt" ? "🏛️" : "📋"} {d.title}
                </span>
                <Badge variant={daysUntil(d.dueDate) <= 7 ? "destructive" : "outline"}>
                  {d.dueDate} ({daysUntil(d.dueDate)} dgr)
                </Badge>
              </Link>
            ))}
            {overdueInvoices.length === 0 && dueSuppliers.length === 0 && upcoming.length === 0 && (
              <p className="text-muted-foreground">Allt är i fas. 🎉</p>
            )}
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

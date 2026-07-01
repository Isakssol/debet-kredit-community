import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSEK, kronorToOre } from "@/lib/money";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: fy }, { data: balances }, { data: recent }] = await Promise.all([
    supabase.from("fiscal_years").select("*").eq("status", "open").order("year", { ascending: false }).limit(1).single(),
    supabase.from("account_balances").select("*"),
    supabase
      .from("verifications")
      .select("id, verification_date, description, number, verification_series(code)")
      .order("registered_at", { ascending: false })
      .limit(8),
  ]);

  const bal = balances ?? [];
  const bankSaldo = bal.filter((b) => b.account! >= 1910 && b.account! <= 1940)
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);
  // Resultat = intäkter (klass 3, kreditsaldo) minus kostnader (klass 4–8)
  const resultat = bal.filter((b) => b.class! >= 3)
    .reduce((s, b) => s - kronorToOre(Number(b.balance)), 0);
  const uttag = bal.filter((b) => [2011, 2012, 2013].includes(b.account!))
    .reduce((s, b) => s + kronorToOre(Number(b.balance)), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Översikt</h1>
          <p className="text-sm text-muted-foreground">Räkenskapsår {fy?.year ?? "—"}</p>
        </div>
        <Button asChild>
          <Link href="/verifikat/ny">Ny verifikation</Link>
        </Button>
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
                  <Link href={`/verifikat/${v.id}`} className="hover:underline">
                    <span className="font-mono text-muted-foreground mr-3">
                      {(v.verification_series as unknown as { code: string })?.code}
                      {v.number}
                    </span>
                    {v.description}
                  </Link>
                  <span className="text-muted-foreground">{v.verification_date}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

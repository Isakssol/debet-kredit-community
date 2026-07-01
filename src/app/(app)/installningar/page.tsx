import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings-form";
import { PeriodLocks } from "@/components/period-locks";
import { OpeningBalances } from "@/components/opening-balances";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: fiscalYears }, { data: locks }, { data: series }, { data: accounts }, { count: verCount }] =
    await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).single(),
      supabase.from("fiscal_years").select("*").order("year", { ascending: false }),
      supabase.from("period_locks").select("*"),
      supabase.from("verification_series").select("*, fiscal_years(year)").order("code"),
      supabase.from("accounts").select("number, name").eq("active", true).order("number"),
      supabase.from("verifications").select("id", { count: "exact", head: true }),
    ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Inställningar</h1>

      <SettingsForm settings={settings!} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Räkenskapsår & verifikationsserier</CardTitle>
          <CardDescription>
            Enskild firma måste ha kalenderår. Nytt år skapas automatiskt vid årsavslutet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fiscalYears?.map((fy) => (
            <div key={fy.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium">{fy.year}</span>
              <Badge variant={fy.status === "open" ? "outline" : "secondary"}>
                {fy.status === "open" ? "Öppet" : "Avslutat"}
              </Badge>
              <Badge variant="outline">{fy.accounting_method}</Badge>
              <span className="text-muted-foreground">
                Serier: {series?.filter((s) => s.fiscal_year_id === fy.id).map((s) => s.code).join(", ")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <PeriodLocks
        fiscalYears={(fiscalYears ?? []).map((fy) => ({ id: fy.id, year: fy.year, status: fy.status }))}
        locks={(locks ?? []).map((l) => ({
          fiscalYearId: l.fiscal_year_id, month: l.month, reason: l.reason,
        }))}
      />

      <OpeningBalances
        accounts={(accounts ?? []).map((a) => ({ number: a.number, name: a.name }))}
        hasVerifications={(verCount ?? 0) > 0}
      />
    </div>
  );
}

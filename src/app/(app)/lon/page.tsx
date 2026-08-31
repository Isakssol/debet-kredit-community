import { createClient } from "@/lib/supabase/server";
import { PayrollForm } from "@/components/payroll-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fmt = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PayrollPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: runs }] = await Promise.all([
    supabase.from("settings").select("company_type, org_number").eq("id", 1).single(),
    supabase.from("payroll_runs").select("*").order("period", { ascending: false }).limit(24),
  ]);

  if (settings?.company_type === "enskild_firma") {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Lön</h1>
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Lön gäller aktiebolag och handelsbolag med anställda.</p>
            <p>
              I enskild firma tar du inte ut lön — du gör egna uttag (se Skatt &amp; eget
              uttag). Byter du bolagsform ändrar du bolagstyp under Inställningar.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Lön</h1>
        <p className="text-sm text-muted-foreground">
          Enkel lönekörning för fåmansbolag: en anställd, fast månadslön. Bokförs
          automatiskt (7210/7510/2710/2731/1930) och genererar AGI-fil för
          uppladdning till Skatteverket. Skatteavdraget hämtar du ur din skattetabell
          på skatteverket.se.
        </p>
      </div>

      <PayrollForm hasOrgNumber={!!settings?.org_number} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lönekörningar</CardTitle>
          <CardDescription>
            AGI-filen lämnas in via Skatteverkets e-tjänst (filöverföring) senast den
            12:e i månaden efter löneutbetalningen. Testa gärna filen i Skatteverkets
            testtjänst första gången.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!runs?.length ? (
            <p className="text-sm text-muted-foreground">Inga lönekörningar ännu.</p>
          ) : (
            <ul className="text-sm divide-y">
              {runs.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium">{r.period.slice(0, 4)}-{r.period.slice(4)}</span>{" "}
                    <span className="text-muted-foreground">
                      · {r.employee_name} · brutto {fmt(Number(r.gross_salary))} kr ·
                      skatt {fmt(Number(r.tax_deduction))} kr ·
                      arbetsgivaravgift {fmt(Number(r.employer_fee))} kr
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">Bokförd</Badge>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/lon/agi?period=${r.period}`}>AGI-fil</a>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

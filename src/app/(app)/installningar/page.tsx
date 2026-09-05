import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings-form";
import { CompanySettings } from "@/components/company-settings";
import { AppearanceSettings } from "@/components/appearance-settings";
import { PeriodLocks } from "@/components/period-locks";
import { OpeningBalances } from "@/components/opening-balances";
import { SieImport } from "@/components/sie-import";
import { MigrationImport } from "@/components/migration-import";
import { ByraAccessSettings, type ByraKeyRow } from "@/components/byra-access-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsToc, SettingsSection, type SettingsGroup } from "@/components/settings-section";

/**
 * Avsnitten på sidan, i ordning. Innehållsförteckningen och rubrikerna läser
 * samma lista, så en ny grupp kan aldrig bli osynlig i förteckningen.
 */
const GROUPS: SettingsGroup[] = [
  { id: "foretaget", title: "Företaget" },
  { id: "atkomst", title: "Åtkomst" },
  { id: "bokforing", title: "Bokföringens ramar" },
  { id: "import", title: "Import och migrering" },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: fiscalYears }, { data: locks }, { data: series }, { data: accounts }, { count: verCount }, { data: byraKeys }] =
    await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).single(),
      supabase.from("fiscal_years").select("*").order("year", { ascending: false }),
      supabase.from("period_locks").select("*"),
      supabase.from("verification_series").select("*, fiscal_years(year)").order("code"),
      supabase.from("accounts").select("number, name").eq("active", true).order("number"),
      supabase.from("verifications").select("id", { count: "exact", head: true }),
      // key_hash läses aldrig hit: hashen har inget ärende i en webbläsare.
      supabase
        .from("byra_keys")
        .select("id, agency_name, key_prefix, created_at, last_used_at, revoked_at, note")
        .order("created_at", { ascending: false }),
    ]);

  const companyType = settings?.company_type ?? "enskild_firma";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Inställningar</h1>
        <p className="text-sm text-muted-foreground">
          Allt som gäller hela företaget — identitet, bokföringens ramar och
          engångsjobben vid byte från ett annat program.
        </p>
      </div>

      <SettingsToc groups={GROUPS} />

      <SettingsSection id="foretaget" title="Företaget"
        description="Identitet, bolagsform och utseende — uppgifterna som hamnar på fakturor och rapporter.">
        {/* Kolumnen ai_api_key finns kvar i schemat men används inte här — skala
            bort den så att en gammal nyckel aldrig når klienten. */}
        <SettingsForm settings={(({ ai_api_key: _key, ...rest }) => rest)(settings!) as typeof settings & object}
          companyType={companyType} />

        <CompanySettings companyType={companyType} />

        <AppearanceSettings
          accent={settings?.theme_accent ?? null}
          background={settings?.theme_background ?? null}
        />
      </SettingsSection>

      <SettingsSection id="atkomst" title="Åtkomst"
        description="Vem utanför företaget som kommer åt bokföringen.">
        <ByraAccessSettings
          keys={(byraKeys ?? []) as ByraKeyRow[]}
          demo={process.env.DEMO_MODE === "1"}
        />
      </SettingsSection>

      <SettingsSection id="bokforing" title="Bokföringens ramar"
        description="Räkenskapsår, verifikationsserier och vilka perioder som är låsta.">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Räkenskapsår & verifikationsserier</CardTitle>
            <CardDescription>
              {companyType === "enskild_firma"
                ? "Enskild firma måste ha kalenderår. Nytt år skapas automatiskt vid årsavslutet."
                : "Nytt år skapas automatiskt vid årsavslutet och följer ditt räkenskapsår, även brutet."}
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
      </SettingsSection>

      <SettingsSection id="import" title="Import och migrering"
        description="Engångsjobb vid byte från ett annat program. De här behöver du sällan igen.">
        <div id="sie-import" className="scroll-mt-20">
          <SieImport />
        </div>

        <MigrationImport />

        <div id="ingaende-balanser" className="scroll-mt-20">
          <OpeningBalances
            accounts={(accounts ?? []).map((a) => ({ number: a.number, name: a.name }))}
            hasVerifications={(verCount ?? 0) > 0}
          />
        </div>
      </SettingsSection>
    </div>
  );
}

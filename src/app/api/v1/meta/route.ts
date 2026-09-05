/**
 * GET /api/v1/meta — vad den här installationen är, och vad din nyckel får göra.
 *
 *   Authorization: Bearer dk_live_…
 *   → 200 { api_version, schema_version, app_version,
 *           installation_schema_version, key, fiscal_years,
 *           period_locked_to, vat_due_date, endpoints }
 *
 * VARFÖR RUTTEN FINNS. Stripe och Fortnox dokumenterar EN bas-URL och en
 * version. Vi har lika många installationer som kunder, och varje kund kör sin
 * egen. Utan ett upptäcktsanrop måste integratören gissa vad just den här
 * installationen kan — vilka räkenskapsår som är öppna, till och med vilket
 * datum bokföringen är låst, vilka endpoints som finns i den versionen. Det
 * här svaret säger det i stället för att gissas.
 *
 * INGEN SÄRSKILD BEHÖRIGHET, MED FLIT. Varje giltig nyckel duger. Krävde
 * rutten `data:read` kunde en nyckel med enbart `ledger:write` inte ta reda på
 * vad den själv får göra — och just den nyckeln är den som mest behöver veta
 * till vilket datum bokföringen är låst innan den försöker bokföra.
 *
 * Rutten dubbeltjänar som "testa nyckeln"-knappen i Inställningar: det curl-
 * anrop som visas när en nyckel skapas pekar hit, så det första lyckade
 * anropet ligger ett klistrande bort.
 */
import { type NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { apiOk, apiThrown } from "@/lib/api/errors";
import { API_SCHEMA_VERSION, API_VERSION, endpointSummary } from "@/lib/api/catalog";
import { APP_VERSION } from "@/lib/app-version";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bara de fält låsberäkningen behöver. Rutten läser fler kolumner, men den
 * här typen är vad `sistaLastaDagen()` kräver — och att den är minimal är
 * det som gör funktionen prövbar utan en databas.
 */
export type FiscalYearRad = { id: string; start_date: string; end_date: string };
export type PeriodLockRad = { fiscal_year_id: string; month: number };

/**
 * Sista dagen i den senast låsta månaden, räknad i kalendern.
 *
 * ANPASSNING MOT DEN HÄR UTGÅVANS period_locks. Licensutgåvan lagrar ett
 * datum (`period_start`) och behöver bara veta månadens sista dag. Här bär
 * tabellen `(fiscal_year_id, month)` där `month` är ett KALENDERMÅNADS-
 * nummer — precis så `is_period_locked()` läser den (20260701000001). Vilket
 * ÅR månaden tillhör måste därför härledas ur räkenskapsåret: startårets, om
 * månaden ligger på eller efter startmånaden, annars slutårets.
 *
 * Det gör skillnad så snart räkenskapsåret är brutet. 2026-05-01–2027-04-30
 * med månad 3 låst betyder 2027-03-31, inte 2026-03-31 — ett år fel, och
 * felet pekar dessutom åt det håll som får en integratör att tro att en öppen
 * period är stängd.
 *
 * Uttrycket är ordagrant detsamma som vyn `byra_stats` (20260907000013)
 * använder, så de två svaren kan inte säga olika.
 *
 * Aritmetiken görs på talen och inte via `Date`, av samma skäl som
 * `addDays()` i @/lib/dates finns: dagen ÄR svaret här — det är till och med
 * den här dagen bokföringen är stängd.
 */
export function sistaLastaDagen(
  locks: PeriodLockRad[],
  years: FiscalYearRad[]
): string | null {
  const per = new Map(years.map((y) => [y.id, y]));
  const datum: string[] = [];

  for (const l of locks) {
    const fy = per.get(l.fiscal_year_id);
    if (!fy) continue;
    const start = /^(\d{4})-(\d{2})/.exec(fy.start_date);
    const slut = /^(\d{4})-(\d{2})/.exec(fy.end_date);
    if (!start || !slut) continue;
    if (!Number.isInteger(l.month) || l.month < 1 || l.month > 12) continue;

    const startAr = Number(start[1]);
    const startManad = Number(start[2]);
    const ar = l.month >= startManad ? startAr : Number(slut[1]);
    datum.push(sistaDagenIManaden(ar, l.month));
  }

  return datum.sort().at(-1) ?? null;
}

/** Sista dagen i en månad, med den gregorianska skottårsregeln. */
export function sistaDagenIManaden(ar: number, manad: number): string {
  // Delbart med 4, utom hela sekler som inte är delbara med 400.
  const skottar = (ar % 4 === 0 && ar % 100 !== 0) || ar % 400 === 0;
  const dagar = [31, skottar ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][manad - 1];
  return `${String(ar).padStart(4, "0")}-${String(manad).padStart(2, "0")}-${String(dagar).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return auth.response;
  const { key, scopes, admin, requestId } = auth.ctx;

  /**
   * Räkenskapsåren, låsdatumet och momsdeadlinen läses med SERVICE-klienten,
   * inte med nyckelns session. Det är ett medvetet undantag och värt att
   * motivera, eftersom principen annars är den omvända:
   *
   *  * De tre uppgifterna är exakt de vyn `byra_stats` redan projicerar till
   *    en byrånyckel — alltså en mindre betrodd part än en API-nyckel. Att
   *    låta dem passera här utvidgar ingenting.
   *  * Alternativet vore att kräva `data:read`, och då kunde en ren
   *    skrivnyckel inte ta reda på vad den får skriva i. Ett upptäcktsanrop
   *    som bara fungerar för vissa nycklar är inget upptäcktsanrop.
   *
   * Allt annat i svaret kommer ur nyckelns egen rad eller ur koden. Ingen
   * affärshändelse och inget belopp passerar här.
   */
  try {
    const [{ data: years }, { data: locks }, { data: vat }, { data: schemaVersion }] =
      await Promise.all([
        admin.from("fiscal_years").select("id, year, start_date, end_date, status").order("year", { ascending: false }),
        admin.from("period_locks").select("fiscal_year_id, month"),
        admin
          .from("tax_deadlines")
          .select("due_date")
          .eq("type", "moms")
          .eq("status", "pending")
          // todayISO() och inte toISOString(): ett svenskt bokföringsdatum
          // ligger aldrig i UTC. Mellan midnatt och kl. 01/02 hade UTC-datumet
          // pekat på gårdagen och svarat med en momsdeadline som redan passerat.
          .gte("due_date", todayISO())
          .order("due_date")
          .limit(1)
          .maybeSingle(),
        admin.rpc("byra_schema_version"),
      ]);

    const arListan = (years ?? []) as (FiscalYearRad & { year: number; status: string })[];

    return apiOk(
      {
        api_version: API_VERSION,
        schema_version: API_SCHEMA_VERSION,
        app_version: APP_VERSION,
        /**
         * Antalet körda migrationer i den här installationen. 0 betyder okänt
         * (installationen fördes upp utan migrationsliggare — rå SQL eller en
         * återställd dump), och då ska en integration säga att den inte vet i
         * stället för att gissa. Samma tal och samma betydelse som
         * byråkontraktets fält med samma namn.
         */
        installation_schema_version: typeof schemaVersion === "number" ? schemaVersion : 0,
        key: { name: key.name, scopes },
        fiscal_years: arListan.map((y) => ({
          year: y.year,
          start: y.start_date,
          end: y.end_date,
          status: y.status,
        })),
        period_locked_to: sistaLastaDagen((locks ?? []) as PeriodLockRad[], arListan),
        vat_due_date: vat?.due_date ?? null,
        endpoints: endpointSummary(),
      },
      requestId
    );
  } catch (e) {
    return apiThrown(e, requestId, "meta");
  }
}

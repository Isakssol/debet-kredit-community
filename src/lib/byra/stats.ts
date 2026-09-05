/**
 * Aggregatet byrån läser — logiken, utan Next och utan Supabase.
 *
 * Rutten `/api/stats/byra` är ett skal runt den här filen. Skälet till
 * uppdelningen är detsamma som för växlingen i `exchange.ts`: felkoderna och
 * svarets form är ett kontrakt mot en portal som inte ligger i det här
 * repot, och ett kontrakt ska gå att prova utan att starta en webbserver.
 *
 * VAD RUTTEN INTE GÖR. Den räknar ingenting. Varje siffra kommer ur vyn
 * `byra_stats` (migration 20260907000013), som gör aggregeringen i SQL med
 * en rad ut. Det är inte en prestandaoptimering utan en säkerhetsegenskap:
 * hade Node paginerat fram summorna hade Node också behövt läsa raderna, och
 * då hade "byrån ser bara aggregat" varit ett löfte i en kodkommentar i
 * stället för ett villkor i databasen. Byrånyckeln får inte läsa en enda
 * bastabell, så den vägen är stängd även om någon skriver koden fel.
 *
 * BEHÖRIGHETEN AVGÖRS AV DATABASEN, INTE AV RUTTEN. Anroparen visar upp en
 * token ur växlingsrutten; PostgREST kör frågan som den token och vyns grind
 * slår upp `byra_keys` vid varje fråga. En återkallelse biter därför inom
 * samma sekund, inte när token löper ut. Att vyn också går att läsa med din
 * egen inloggning är avsiktligt — den som misstänker att byrån ser för mycket
 * ska kunna öppna exakt samma vy själv.
 */

/**
 * KONTRAKTSVERSIONEN för svarets form. Detta är fältet portalen ska grena
 * på, och det enda talet som ändras när formen ändras.
 *
 * Regeln: bumpa vid varje ändring som inte är rent additiv — ett borttaget
 * fält, ett omdöpt fält, en ändrad betydelse eller enhet. Nya fält som en
 * gammal läsare kan ignorera lämnar talet i fred.
 *
 * Förväxla den inte med `installation_schema_version` i svaret. De svarar på
 * olika frågor och kan inte ersätta varandra:
 *
 *   schema_version              → "kan portalen läsa det här svaret?"
 *   installation_schema_version → "hur gammal är klientens installation?"
 *
 * Det andra talet är antalet körda migrationer i klientens databas och ökar
 * av sig självt vid varje uppgradering. 0 betyder okänt (installationen
 * fördes upp utan migrationsliggare — rå SQL eller en återställd dump), och
 * då ska portalen säga att den inte vet i stället för att gissa.
 */
export const BYRA_STATS_SCHEMA_VERSION = 1;

/** En rad ur vyn `byra_stats`, som PostgREST levererar den. */
export type ByraStatsRow = {
  schema_version: number | null;
  period: string | null;
  unbooked_count: number | null;
  unmatched_bank: number | null;
  attachments_missing: number | null;
  last_verification: string | null;
  period_locked_to: string | null;
  vat_due_date: string | null;
  fiscal_year_start: string | null;
  fiscal_year_end: string | null;
  fiscal_year_status: string | null;
};

/**
 * Svarets form. Räkenskapsåret är alltid ett objekt, även när ingen period
 * täcker dagens datum — en portal som ska rita en kolumn ska slippa skilja
 * "fältet saknas" från "värdet är null".
 */
export type ByraStatsBody = {
  schema_version: number;
  installation_schema_version: number;
  period: string;
  unbooked_count: number;
  attachments_missing: number;
  unmatched_bank: number;
  last_verification: string | null;
  period_locked_to: string | null;
  vat_due_date: string | null;
  fiscal_year: { start: string | null; end: string | null; status: string | null };
};

export type ByraStatsError = { error: string; message: string };

export type ByraStatsResult =
  | { ok: true; status: 200; body: ByraStatsBody }
  | { ok: false; status: 401 | 403 | 500; body: ByraStatsError };

/** Vad ett läsförsök mot vyn gav. `status` är PostgREST:s HTTP-status. */
export type ByraStatsQuery = {
  status: number;
  rows: ByraStatsRow[] | null;
  errorMessage: string | null;
};

export type ByraStatsDeps = {
  /** Läser vyn som den uppvisade token. Kastar bara vid nätverksfel. */
  readStats: (jwt: string) => Promise<ByraStatsQuery>;
};

const UNAUTHORIZED: ByraStatsResult = {
  ok: false,
  status: 401,
  body: {
    error: "unauthorized",
    message: "Saknad eller ogiltig token. Växla byrånyckeln mot en ny på /api/byra/token.",
  },
};

/**
 * Token är äkta men öppnar ingenting. I praktiken två fall, och båda betyder
 * samma sak för portalen: nyckeln är återkallad (token utfärdades före
 * återkallelsen och lever kvar sin timme), eller så tillhör token en
 * identitet som vyns grind inte släpper förbi.
 *
 * Egen kod, inte `unauthorized`. Portalens tillstånd `atkomst_aterkallad`
 * hänger på att en laglig återkallelse går att skilja från ett haveri, och
 * växlingsruttens `key_revoked` täcker bara det tidigare ledet. Portalen ska
 * behandla `key_revoked` och `no_access` som samma tillstånd.
 */
const NO_ACCESS: ByraStatsResult = {
  ok: false,
  status: 403,
  body: {
    error: "no_access",
    message:
      "Token är giltig men har ingen läsrätt till aggregatet. Åtkomsten kan vara återkallad av klienten.",
  },
};

const DB_ERROR: ByraStatsResult = {
  ok: false,
  status: 500,
  body: { error: "db_error", message: "Aggregatet kunde inte läsas. Försök igen." },
};

/**
 * Bearer-token ur Authorization, formkontrollerad som en JWT.
 *
 * Kontrollen är inte ett säkerhetsskydd — den token som passerar valideras
 * ändå av databasen — utan ett skydd mot att skicka vidare vad som helst i
 * ett HTTP-huvud. Tre base64url-delar separerade med punkt kan per
 * konstruktion inte innehålla radbrytning eller blanksteg.
 */
export function jwtFromHeader(header: string | null | undefined): string {
  const value = header ?? "";
  if (!value.toLowerCase().startsWith("bearer ")) return "";
  const token = value.slice(7).trim();
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : "";
}

/**
 * Vyns rad → svarets form.
 *
 * Räknarna är `count(*)` i SQL och kan aldrig bli null där. `?? 0` finns för
 * den läsare som byter ut vyn mot något som kan: en saknad siffra ska bli en
 * nolla i portalen, inte ett `null` som tyst renderas som tom cell och ser ut
 * som "allt är klart".
 */
export function toByraStatsBody(row: ByraStatsRow): ByraStatsBody {
  return {
    schema_version: BYRA_STATS_SCHEMA_VERSION,
    installation_schema_version: row.schema_version ?? 0,
    period: row.period ?? "",
    unbooked_count: row.unbooked_count ?? 0,
    attachments_missing: row.attachments_missing ?? 0,
    unmatched_bank: row.unmatched_bank ?? 0,
    last_verification: row.last_verification,
    period_locked_to: row.period_locked_to,
    vat_due_date: row.vat_due_date,
    fiscal_year: {
      start: row.fiscal_year_start,
      end: row.fiscal_year_end,
      status: row.fiscal_year_status,
    },
  };
}

export async function readByraStats(
  deps: ByraStatsDeps,
  authorizationHeader: string | null | undefined
): Promise<ByraStatsResult> {
  const jwt = jwtFromHeader(authorizationHeader);
  if (!jwt) return UNAUTHORIZED;

  let query: ByraStatsQuery;
  try {
    query = await deps.readStats(jwt);
  } catch {
    return DB_ERROR;
  }

  // 401/403 från PostgREST betyder att databasen inte kände igen token —
  // utgången, felsignerad eller från ett annat projekt. Det är anroparens
  // fel och ska inte se ut som ett haveri i installationen.
  if (query.status === 401 || query.status === 403) return UNAUTHORIZED;
  if (query.errorMessage) return DB_ERROR;

  const row = query.rows?.[0];
  // Vyn projicerar aldrig en rad till en anropare grinden nekar. Tomt svar
  // med 200 är alltså inte "inga siffror" utan "ingen åtkomst".
  if (!row) return NO_ACCESS;

  return { ok: true, status: 200, body: toByraStatsBody(row) };
}

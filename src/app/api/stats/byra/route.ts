/**
 * GET /api/stats/byra
 *
 * Aggregatet en redovisningsbyrå får läsa. En rad, inga affärshändelser.
 *
 *   Authorization: Bearer <token från POST /api/byra/token>
 *   → 200 { schema_version, installation_schema_version, period,
 *           unbooked_count, attachments_missing, unmatched_bank,
 *           last_verification, period_locked_to, vat_due_date,
 *           fiscal_year: { start, end, status } }
 *   → 401 { error: "unauthorized" }  saknad, felformad eller avvisad token
 *   → 403 { error: "no_access" }     token duger, men öppnar ingenting
 *   → 429 { error: "rate_limited" }
 *   → 500 { error: "db_error" }
 *   → 503 { error: "server_misconfigured" }
 *
 * Rutten har MED FLIT ingen egen behörighetskontroll utöver formen på
 * token. Den skickar vidare anroparens token till PostgREST och läser vyn
 * `byra_stats` som den — behörigheten härleds ur `byra_keys` vid varje fråga,
 * så en återkallelse biter i samma sekund i stället för när token löper ut.
 * Ett villkor i den här filen hade dessutom varit ett andra ställe att hålla
 * synkat med vyns grind, och det andra stället är alltid det som glöms.
 *
 * Att svaret också går att hämta med din egen inloggning är avsiktligt: den
 * som misstänker att byrån ser för mycket ska kunna hämta exakt samma svar
 * själv och räkna fälten. Se `src/lib/byra/stats.ts` för kontraktet och
 * varför `schema_version` och `installation_schema_version` är två tal.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readByraStats, type ByraStatsRow } from "@/lib/byra/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Vyns kolumner, uppräknade. `select("*")` hade tagit med framtida kolumner utan beslut. */
const COLUMNS =
  "schema_version, period, unbooked_count, unmatched_bank, attachments_missing, " +
  "last_verification, period_locked_to, vat_due_date, " +
  "fiscal_year_start, fiscal_year_end, fiscal_year_status";

/**
 * Enkel in-memory rate limit (per instans). Samma form som /api/stats/daily
 * och /api/byra/token — serverless gör den till best effort, men den stoppar
 * loopar och håller nere trafiken mot databasen.
 *
 * Nyckeln är avsändarens adress, inte token: byråportalen växlar en ny token
 * varje varv, så en tokenbaserad räknare hade nollställts av varje anrop och
 * inte räknat någonting. Ett nattligt pollvarv är ett anrop per installation.
 */
const RATE_LIMIT = 60; // anrop per timme och avsändare
const hits = new Map<string, { count: number; windowStart: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.windowStart > 3_600_000) {
    hits.set(key, { count: 1, windowStart: now });
    return false;
  }
  h.count += 1;
  return h.count > RATE_LIMIT;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "okand";
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503, ...noStore });
  }

  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, ...noStore });
  }

  const result = await readByraStats(
    {
      async readStats(jwt) {
        // Anon-nyckeln + anroparens token: PostgREST kör frågan som byrån.
        // Service-nyckeln får inte röras här — den hade gått förbi vyns
        // rollvillkor och svarat 200 även på en återkallad nyckel.
        const supabase = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${jwt}` } },
        });
        const { data, error, status } = await supabase
          .from("byra_stats")
          .select(COLUMNS)
          .limit(1);
        return {
          status,
          rows: (data as ByraStatsRow[] | null) ?? null,
          errorMessage: error?.message ?? null,
        };
      },
    },
    request.headers.get("authorization")
  );

  return NextResponse.json(result.body, { status: result.status, ...noStore });
}

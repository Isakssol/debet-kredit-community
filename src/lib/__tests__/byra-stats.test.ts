import { describe, expect, test, vi } from "vitest";
import {
  BYRA_STATS_SCHEMA_VERSION,
  jwtFromHeader,
  readByraStats,
  toByraStatsBody,
  type ByraStatsDeps,
  type ByraStatsRow,
} from "../byra/stats";

/**
 * Enhetsprov av `/api/stats/byra`.
 *
 * Det testerna kan avgöra är kontraktet: vilken form svaret har, vilken
 * felkod varje utfall ger, och att inget fält tappas på vägen från vyn till
 * portalen. Det de INTE kan avgöra är om vyn räknar rätt — den frågan
 * besvaras skarpt i byra-live.integration.test.ts, mot en riktig databas med
 * seedade rader.
 *
 * Skillnaden är värd att hålla isär. Ett grönt prov här betyder "portalen
 * kommer att kunna läsa svaret", inte "siffran stämmer".
 */

/** En rad som vyn skulle ge för en installation med kända, seedade siffror. */
function row(over: Partial<ByraStatsRow> = {}): ByraStatsRow {
  return {
    schema_version: 42,
    period: "202609",
    unbooked_count: 7,
    unmatched_bank: 5,
    attachments_missing: 3,
    last_verification: "2026-08-31",
    period_locked_to: "2026-07-31",
    vat_due_date: "2026-11-12",
    fiscal_year_start: "2026-01-01",
    fiscal_year_end: "2026-12-31",
    fiscal_year_status: "open",
    ...over,
  };
}

function deps(over: Partial<ByraStatsDeps> = {}): ByraStatsDeps {
  return {
    readStats: vi.fn(async () => ({ status: 200, rows: [row()], errorMessage: null })),
    ...over,
  };
}

const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJieXJhIn0.c2lnbmF0dXJl";

describe("token ur Authorization", () => {
  test.each([
    ["rätt bearer", `Bearer ${JWT}`, JWT],
    ["gemener i schemat", `bearer ${JWT}`, JWT],
    ["blanksteg runt om", `Bearer   ${JWT}  `, JWT],
  ])("%s plockas ut", (_namn, header, forvantad) => {
    expect(jwtFromHeader(header)).toBe(forvantad);
  });

  test.each([
    ["saknas helt", null],
    ["tom sträng", ""],
    ["fel schema", `Token ${JWT}`],
    ["utan schema", JWT],
    ["två delar", "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJieXJhIn0"],
    ["fyra delar", `${JWT}.extra`],
    ["radbrytning i token", "Bearer aaa.bbb\nccc"],
    ["blanksteg i token", "Bearer aaa.bbb ccc"],
    ["otillåtet tecken", "Bearer aaa.bbb.cc+c"],
  ])("%s ger tom sträng", (_namn, header) => {
    expect(jwtFromHeader(header)).toBe("");
  });

  test("en felformad token når aldrig databasen", async () => {
    const d = deps();
    const res = await readByraStats(d, "Bearer trasig");
    expect(res.status).toBe(401);
    expect(d.readStats).not.toHaveBeenCalled();
  });
});

describe("rätt token", () => {
  test("ger 200 och exakt de fält portalen väntar sig", async () => {
    const res = await readByraStats(deps(), `Bearer ${JWT}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.body).sort()).toEqual(
      [
        "attachments_missing",
        "fiscal_year",
        "installation_schema_version",
        "last_verification",
        "period",
        "period_locked_to",
        "schema_version",
        "unbooked_count",
        "unmatched_bank",
        "vat_due_date",
      ].sort()
    );
  });

  test("anroparens token skickas vidare, inte någon annans", async () => {
    const d = deps();
    await readByraStats(d, `Bearer ${JWT}`);
    expect(d.readStats).toHaveBeenCalledWith(JWT);
  });

  test("aggregaten kommer oförvanskade ur den seedade raden", async () => {
    const res = await readByraStats(deps(), `Bearer ${JWT}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toEqual({
      schema_version: BYRA_STATS_SCHEMA_VERSION,
      installation_schema_version: 42,
      period: "202609",
      unbooked_count: 7,
      attachments_missing: 3,
      unmatched_bank: 5,
      last_verification: "2026-08-31",
      period_locked_to: "2026-07-31",
      vat_due_date: "2026-11-12",
      fiscal_year: { start: "2026-01-01", end: "2026-12-31", status: "open" },
    });
  });

  test("obokfört och omatchat är två tal och blandas inte ihop", () => {
    // Vyn räknar omatchade banktransaktioner i BÅDA — obokfört är dessutom
    // underlagen i inkorgen (attachments utan verification_id). Ett hopblandat
    // mappningsfel hade sett rimligt ut i varje enskilt svar men gjort brädans
    // två kolumner identiska.
    const body = toByraStatsBody(row({ unbooked_count: 11, unmatched_bank: 5 }));
    expect(body.unbooked_count).toBe(11);
    expect(body.unmatched_bank).toBe(5);
  });

  test("räkenskapsåret är alltid ett objekt, även när ingen period är öppen", () => {
    const body = toByraStatsBody(
      row({ fiscal_year_start: null, fiscal_year_end: null, fiscal_year_status: null })
    );
    expect(body.fiscal_year).toEqual({ start: null, end: null, status: null });
  });

  test("saknade räknare blir noll, inte null", () => {
    const body = toByraStatsBody(
      row({ unbooked_count: null, unmatched_bank: null, attachments_missing: null })
    );
    expect(body.unbooked_count).toBe(0);
    expect(body.unmatched_bank).toBe(0);
    expect(body.attachments_missing).toBe(0);
  });

  test("saknade datum förblir null och fylls aldrig i med dagens datum", () => {
    const body = toByraStatsBody(
      row({ last_verification: null, period_locked_to: null, vat_due_date: null })
    );
    expect(body.last_verification).toBeNull();
    expect(body.period_locked_to).toBeNull();
    expect(body.vat_due_date).toBeNull();
  });

  test("en installation utan migrationsliggare rapporteras som okänd, inte gissad", () => {
    expect(toByraStatsBody(row({ schema_version: null })).installation_schema_version).toBe(0);
    expect(toByraStatsBody(row({ schema_version: 0 })).installation_schema_version).toBe(0);
  });

  test("kontraktsversionen är ett tal, inte installationens", () => {
    // Talen är två och ska aldrig kunna kollapsa till ett: det ena säger om
    // portalen kan läsa svaret, det andra hur gammal klientens installation är.
    const body = toByraStatsBody(row({ schema_version: 999 }));
    expect(body.schema_version).toBe(BYRA_STATS_SCHEMA_VERSION);
    expect(body.installation_schema_version).toBe(999);
    expect(Number.isInteger(BYRA_STATS_SCHEMA_VERSION)).toBe(true);
    expect(BYRA_STATS_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  test("perioden har portalens form YYYYMM", async () => {
    const res = await readByraStats(deps(), `Bearer ${JWT}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.period).toMatch(/^20\d{2}(0[1-9]|1[0-2])$/);
  });

  test("inga belopp, motparter eller rader läcker med i svaret", async () => {
    const res = await readByraStats(deps(), `Bearer ${JWT}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const text = JSON.stringify(res.body);
    for (const ord of ["amount", "belopp", "counterparty", "rows", "verification_id"]) {
      expect(text).not.toContain(ord);
    }
  });
});

describe("token som inte öppnar något", () => {
  test("återkallad nyckel: vyn ger noll rader → 403 no_access", async () => {
    // Token är äkta och lever sin timme ut, men byra_has_access() blir falsk i
    // samma sekund revoked_at sätts, så vyn projicerar ingen rad.
    const res = await readByraStats(
      deps({ readStats: vi.fn(async () => ({ status: 200, rows: [], errorMessage: null })) }),
      `Bearer ${JWT}`
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_access");
  });

  test("grinden nekar: en identitet vyn inte släpper förbi ger samma svar", async () => {
    const res = await readByraStats(
      deps({ readStats: vi.fn(async () => ({ status: 200, rows: null, errorMessage: null })) }),
      `Bearer ${JWT}`
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_access");
  });

  test("no_access är inte unauthorized — en laglig återkallelse är inget haveri", async () => {
    const utan = await readByraStats(
      deps({ readStats: vi.fn(async () => ({ status: 200, rows: [], errorMessage: null })) }),
      `Bearer ${JWT}`
    );
    const ogiltig = await readByraStats(deps(), "Bearer trasig");
    expect(utan.body).not.toEqual(ogiltig.body);
    expect(utan.status).not.toBe(ogiltig.status);
  });

  test.each([401, 403])("databasen avvisar token med %i → 401 unauthorized", async (status) => {
    const res = await readByraStats(
      deps({
        readStats: vi.fn(async () => ({ status, rows: null, errorMessage: "JWT expired" })),
      }),
      `Bearer ${JWT}`
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });
});

describe("fel som inte är behörighetsfel", () => {
  test("databasfel ger 500 db_error, inte ett tomt aggregat", async () => {
    const res = await readByraStats(
      deps({
        readStats: vi.fn(async () => ({
          status: 500,
          rows: null,
          errorMessage: 'relation "byra_stats" does not exist',
        })),
      }),
      `Bearer ${JWT}`
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("db_error");
  });

  test("ett kastat fel blir 500, inte en krasch", async () => {
    const res = await readByraStats(
      deps({
        readStats: vi.fn(async () => {
          throw new Error("ECONNRESET");
        }),
      }),
      `Bearer ${JWT}`
    );
    expect(res.status).toBe(500);
  });

  test("felmeddelanden från databasen läcker aldrig ut i svaret", async () => {
    // Ett PostgREST-fel kan innehålla kolumnnamn och SQL-fragment. Portalen
    // behöver veta ATT det gick fel, inte var i schemat.
    const res = await readByraStats(
      deps({
        readStats: vi.fn(async () => ({
          status: 500,
          rows: null,
          errorMessage: 'column "settings.ai_api_key" does not exist',
        })),
      }),
      `Bearer ${JWT}`
    );
    expect(JSON.stringify(res.body)).not.toContain("ai_api_key");
  });
});

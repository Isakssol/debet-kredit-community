/**
 * GOLDEN: Bokföringsmotorns invarianter.
 *
 * Balanskrav, oföränderlighet och rättelse, arkiveringsskyddet för underlag,
 * och att appens förkontroll ger samma svar som motorns egen avrundning.
 *
 * Varje förväntat värde är hämtat ur lag eller normgivning, inte ur koden.
 * Ett rött test är alltså ett fynd i produkten, aldrig ett fel i testet.
 *
 * KÄLLOR (primärkällor)
 *
 *  [BFL 4:1]    4 kap. 1 § bokföringslagen (1999:1078): den bokföringsskyldige
 *               ska "löpande bokföra alla affärshändelser".
 *               https://lagen.nu/1999:1078#K4P1
 *  [BFL 5:1]    5 kap. 1 § BFL: "Affärshändelserna skall bokföras så att de kan
 *               presenteras i registreringsordning (grundbokföring) och i
 *               systematisk ordning (huvudbokföring)."
 *               https://lagen.nu/1999:1078#K5P1
 *  [BFL 5:5]    5 kap. 5 § BFL: "Om en bokföringspost rättas, skall det anges
 *               när rättelsen har skett och vem som har gjort den. Sker
 *               rättelsen genom en särskild rättelsepost, skall det samtidigt
 *               säkerställas att det vid en granskning av den rättade
 *               bokföringsposten utan svårighet går att få kännedom om
 *               rättelsen." https://lagen.nu/1999:1078#K5P5
 *  [BFL 5:7]    5 kap. 7 § BFL: verifikationen ska innefatta uppgift om "när
 *               den har sammanställts, när affärshändelsen har inträffat, vad
 *               denna avser, vilket belopp den gäller och vilken motpart den
 *               berör" samt "ett verifikationsnummer eller annat
 *               identifieringstecken". https://lagen.nu/1999:1078#K5P7
 *  [BFL 7:2]    7 kap. 2 § BFL: räkenskapsinformation ska bevaras till och med
 *               det sjunde året efter utgången av det kalenderår då
 *               räkenskapsåret avslutades. https://lagen.nu/1999:1078#K7P2
 *  [BFL 7:6]    7 kap. 6 § BFL: räkenskapsinformation får inte förstöras innan
 *               bevarandetiden gått ut. https://lagen.nu/1999:1078#K7P6
 *  [BFNAR 2.1]  BFNAR 2013:2 punkt 2.1: "Bokföringen ska göras på ett varaktigt
 *               sätt. Det innebär att det som har bokförts inte ska kunna
 *               raderas eller på annat sätt göras oläsligt."
 *               https://www.bfn.se/wp-content/uploads/2020/06/bfnar13-2-grund.pdf
 *  [BFNAR 2.2]  BFNAR 2013:2 punkt 2.2: "Inom den systematiska ordningen ska
 *               registreringsordningen framgå för varje sorteringsbegrepp […]
 *               Använder företaget flera verifikationsnummerserier, ska
 *               registreringsordningen framgå inom varje enskild serie."
 *  [BFNAR 2.3]  BFNAR 2013:2 punkt 2.3: ur den löpande bokföringen ska för varje
 *               bokföringspost kunna utläsas a) registreringsordning,
 *               b) redovisningsperiod, c) verifikationsnummer eller motsvarande
 *               identifieringstecken, d) kontering och e) bokfört belopp.
 *  [BFNAR 2.17] BFNAR 2013:2 punkt 2.17: "I en datorbaserad bokföring ska en
 *               bokföringspost rättas genom en särskild rättelsepost."
 *  [BFNAR 2.18] BFNAR 2013:2 punkt 2.18: "En rättelsepost enligt 5 kap. 5 §
 *               bokföringslagen (1999:1078) utgör en ny bokföringspost och ska
 *               dokumenteras genom en verifikation."
 *  [BFNAR 5.9]  BFNAR 2013:2 punkt 5.9: "En serie av verifikationsnummer eller
 *               andra identifieringstecken ska vara obruten för en tidsperiod."
 *  [BFNAR 5.15] BFNAR 2013:2 punkt 5.15: "Rättas en verifikation ska det göras
 *               på sådant sätt att den ursprungliga uppgiften klart framgår."
 *
 * TOLKNINGAR (noteras, inte gissas)
 *  - Kravet debet = kredit per verifikat står inte som en egen mening i BFL.
 *    Det följer av dubbel bokföring / god redovisningssed och är förutsättningen
 *    för [BFL 5:1] (huvudbokföring på konton) och [BFNAR 2.3 d–e]
 *    (kontering + bokfört belopp). Testerna nedan behandlar det som en hård
 *    invariant i motorn.
 *  - "Obruten serie" [BFNAR 5.9] tolkas här som: numret tilldelas och förbrukas
 *    i samma transaktion som verifikatet skapas. Ett återlämnat nummer efter
 *    radering är inte aktuellt eftersom radering är helt stängd [BFNAR 2.1].
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ==========================================================================
// Testhjälp 1 — motorns faktiska SQL (migrationerna ÄR motorn)
// ==========================================================================

const MIG_DIR = fileURLToPath(new URL("../../../../supabase/migrations/", import.meta.url));

/** Migrationerna i tillämpningsordning (filnamnet är ordningen). */
const MIGRATIONS: { file: string; sql: string }[] = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => ({ file, sql: readFileSync(path.join(MIG_DIR, file), "utf8") }));

/** Hela korpusen i ordning — för sökningar som inte gäller en enskild funktion. */
const SQL_ALL = MIGRATIONS.map((m) => `-- >>> ${m.file}\n${m.sql}`).join("\n");

/**
 * Den EFFEKTIVA definitionen av en funktion: sista `create or replace function`
 * i migrationsordningen vinner, precis som i databasen.
 */
function effectiveFn(name: string): { file: string; body: string } {
  let hit: { file: string; body: string } | null = null;
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${name}\\s*\\(` +
      `[\\s\\S]*?\\$\\$\\s*;`,
    "gi",
  );
  for (const m of MIGRATIONS) {
    const found = m.sql.match(re);
    if (found?.length) hit = { file: m.file, body: found[found.length - 1] };
  }
  if (!hit) throw new Error(`Funktionen ${name} finns inte i migrationerna.`);
  return hit;
}

/**
 * Alla triggrar som är kopplade till en tabell. `[^;]` håller matchningen inom
 * EN sats — annars spänner den över halva korpusen och matchar vad som helst.
 */
function triggersOn(table: string): string[] {
  const re = new RegExp(
    `create\\s+(?:constraint\\s+)?trigger[^;]*?\\bon\\s+${table}\\b[^;]*;`,
    "gi",
  );
  return (SQL_ALL.match(re) ?? []).map((s) => s.replace(/\s+/g, " ").trim());
}

/** Tabell-constraints som nämner ett uttryck, inom en enda ALTER-sats. */
function constraintsMentioning(table: string, needle: RegExp): string[] {
  const re = new RegExp(`alter\\s+table\\s+${table}\\b[^;]*add\\s+constraint[^;]*;`, "gi");
  return (SQL_ALL.match(re) ?? []).filter((s) => needle.test(s));
}

/** Kolumnblocket i `create table <namn> ( ... );` som det skapades. */
function createTableBody(table: string): string {
  const m = SQL_ALL.match(new RegExp(`create table (?:if not exists )?${table} \\(([\\s\\S]*?)\\n\\);`, "i"));
  if (!m) throw new Error(`Tabellen ${table} finns inte i migrationerna.`);
  return m[1];
}

/**
 * Är radnivåsäkerhet påslagen på tabellen? Community slår på RLS i en
 * `foreach t in array array[...]`-loop med `format('alter table %I ...')`,
 * så den explicita formen räcker inte som sökning.
 */
function rlsEnabled(table: string): boolean {
  if (new RegExp(`alter table ${table} enable row level security`, "i").test(SQL_ALL)) return true;
  for (const loop of SQL_ALL.match(/foreach\s+t\s+in\s+array\s+array\[[\s\S]*?end;\s*\$\$;/gi) ?? []) {
    if (!/alter table %I enable row level security/i.test(loop)) continue;
    const arr = loop.match(/array\[([\s\S]*?)\]/i)?.[1] ?? "";
    if ([...arr.matchAll(/'([a-z_]+)'/g)].some((x) => x[1] === table)) return true;
  }
  return false;
}

// ==========================================================================
// Testhjälp 2 — numeric(12,2): exakt decimalavrundning, halvor från noll
// (Postgres `::numeric(12,2)`, till skillnad från JS binära flyttal)
// ==========================================================================

function pgNumeric2(value: number): number {
  // Gå via decimalsträngen, aldrig via binärt flyttal
  const s = value.toPrecision(15);
  const [intPart, frac = ""] = Number(s).toFixed(10).split(".");
  const keep = frac.slice(0, 2).padEnd(2, "0");
  const next = Number(frac[2] ?? "0");
  const neg = intPart.startsWith("-");
  let cents = Number(intPart.replace("-", "")) * 100 + Number(keep);
  if (next >= 5) cents += 1; // halvor avrundas från noll
  return (neg ? -cents : cents) / 100;
}

/** Motorns balanskrav uttryckt exakt som `book_verification` gör det. */
function pgBalances(rows: { debit: number; credit: number }[]): boolean {
  const sum = (pick: (r: { debit: number; credit: number }) => number) =>
    rows.reduce((acc, r) => pgNumeric2(acc + pgNumeric2(pick(r))), 0);
  const d = sum((r) => r.debit);
  const c = sum((r) => r.credit);
  return d === c && d !== 0;
}

// ==========================================================================
// Testhjälp 3 — minimal Supabase-stub så produktens RIKTIGA server-action
// kan köras. Communityutgåvan har en användare, så ingen rollfråga ställs.
// ==========================================================================

type Row = Record<string, unknown>;

let rpcCalls: { fn: string; params: Row }[] = [];

const client = {
  rpc: async (fn: string, params?: Row) => {
    rpcCalls.push({ fn, params: params ?? {} });
    if (fn === "book_verification") {
      return { data: [{ out_id: "ver-1", out_series: params?.p_series_code, out_number: 1 }], error: null };
    }
    if (fn === "correct_verification") {
      return { data: [{ reversal_id: "ver-2", replacement_id: "ver-3" }], error: null };
    }
    return { data: null, error: null };
  },
  from: () => {
    const chain: Record<string, unknown> = {};
    const result = () => ({ data: null, error: null });
    Object.assign(chain, {
      insert: () => chain, upsert: () => chain, update: () => chain, delete: () => chain,
      select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (res: (v: ReturnType<typeof result>) => unknown) => res(result()),
    });
    return chain;
  },
};

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const { bookVerification } = await import("@/lib/actions/verifications");

const row = (account: number, debit: number, credit: number) => ({ account, debit, credit });

beforeEach(() => {
  rpcCalls = [];
});

// ==========================================================================
// 1. BALANSKRAVET  [BFL 5:1, BFNAR 2.3]
// ==========================================================================

describe("Balanskravet — debet = kredit per verifikat", () => {
  it("normalfall: ett balanserat verifikat går igenom till motorn", async () => {
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Kontorsmaterial",
      source: "manual", rows: [row(6110, 800, 0), row(2641, 200, 0), row(1930, 0, 1000)],
    });
    expect(res).not.toHaveProperty("error");
    expect(rpcCalls.map((c) => c.fn)).toEqual(["book_verification"]);
    expect(rpcCalls[0].params.p_rows).toHaveLength(3);
  });

  it("obalans på ett öre stoppas innan motorn nås", async () => {
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Fel",
      source: "manual", rows: [row(6110, 100.0, 0), row(1930, 0, 100.01)],
    });
    expect(res).toHaveProperty("error");
    expect(rpcCalls).toHaveLength(0);
  });

  it("ören: 100,00 fördelat 33,33 + 33,33 + 33,34 balanserar", async () => {
    const rows = [row(1930, 100, 0), row(3011, 0, 33.33), row(3012, 0, 33.33), row(3013, 0, 33.34)];
    expect(pgBalances(rows)).toBe(true);
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Öresfördelning", source: "manual", rows,
    });
    expect(res).not.toHaveProperty("error");
  });

  it("blandade momssatser (25/12/6) balanserar och behåller radordningen [BFNAR 2.2, 2.3 a]", async () => {
    const rows = [
      row(1930, 3430, 0),
      row(3011, 0, 1000), row(2611, 0, 250),
      row(3012, 0, 1000), row(2621, 0, 120),
      row(3013, 0, 1000), row(2631, 0, 60),
    ];
    expect(pgBalances(rows)).toBe(true);
    await bookVerification({
      seriesCode: "A", date: "2026-05-31", description: "Blandad försäljning", source: "manual", rows,
    });
    expect((rpcCalls[0].params.p_rows as Row[]).map((r) => r.account))
      .toEqual([1930, 3011, 2611, 3012, 2621, 3013, 2631]);
  });

  it("negativa belopp avvisas — motriktning bokförs på motsatt sida, aldrig som minuspost", async () => {
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Negativ rad",
      source: "manual", rows: [row(1930, -500, 0), row(3011, 0, -500)],
    });
    expect(res).toHaveProperty("error");
    expect(rpcCalls).toHaveLength(0);
  });

  it("ett verifikat med bara en rad avvisas (dubbel bokföring)", async () => {
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Enkelrad",
      source: "manual", rows: [row(1930, 500, 0)],
    });
    expect(res).toHaveProperty("error");
  });

  it("appens balanskontroll ger samma svar som motorns numeric(12,2)-avrundning", async () => {
    // 1,005 och 0,005 rundas i Postgres till 1,01 respektive 0,01 (halvor från
    // noll) → debet 1,02 mot kredit 1,01. Appen räknade förut med binära flyttal.
    const rows = [row(1910, 1.005, 0), row(1930, 0.005, 0), row(3011, 0, 1.01)];
    const engineAccepts = pgBalances(rows);
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Öresavrundning", source: "manual", rows,
    });
    const appAccepts = !("error" in res);
    expect(appAccepts, "appens förkontroll och motorns avrundning måste ge samma utfall")
      .toBe(engineAccepts);
  });

  it("balanskravet är garanterat av databasen, inte bara av book_verification", () => {
    // Direktskrivningar från service-nyckel eller SQL-editor passerar både RLS
    // och book_verification. Utan constraint/trigger kan ett obalanserat — och
    // enligt [BFNAR 2.1] oraderbart — verifikat landa i huvudboken för alltid.
    const triggerFns = [...triggersOn("verification_rows"), ...triggersOn("verifications")]
      .map((t) => t.match(/execute function (\w+)/i)?.[1])
      .filter((n): n is string => Boolean(n));
    const guards = [...new Set(triggerFns)].filter((n) => {
      const body = effectiveFn(n).body;
      return /sum\s*\(\s*(?:\w+\.)?debit/i.test(body) && /raise\s+exception/i.test(body);
    });
    const checks = [
      ...constraintsMentioning("verification_rows", /sum\s*\(/i),
      ...constraintsMentioning("verifications", /sum\s*\(/i),
    ];
    expect(
      [...guards, ...checks],
      "ingen constraint/trigger håller debet = kredit utanför book_verification",
    ).not.toHaveLength(0);
  });

  it("balansvakten är uppskjuten — annars kan motorn inte lägga in raderna en och en", () => {
    const balanceTriggers = [...triggersOn("verification_rows"), ...triggersOn("verifications")]
      .filter((t) => /verification_assert_balance/i.test(t));
    expect(balanceTriggers.length).toBeGreaterThan(0);
    for (const t of balanceTriggers) {
      expect(t, "constraint trigger måste vara deferrable initially deferred")
        .toMatch(/constraint trigger[\s\S]*deferrable initially deferred/i);
    }
  });

  it("vakten fångar även ett verifikat som aldrig fick några rader", () => {
    const body = effectiveFn("verification_assert_balance").body;
    expect(body).toMatch(/v_rows\s*<\s*2/i);
    expect(body).toMatch(/v_debit\s*=\s*0/i);
    expect(triggersOn("verifications").join(" ")).toMatch(/verification_assert_balance/i);
  });
});

// ==========================================================================
// 2. NUMMERSERIEN  [BFNAR 5.9, BFL 5:7]
// ==========================================================================

describe("Verifikationsserien — obruten följd", () => {
  const book = effectiveFn("book_verification").body;

  it("numret låses och förbrukas i samma transaktion som verifikatet skapas [BFNAR 5.9]", () => {
    expect(book).toMatch(/from verification_series[\s\S]*?for update/i);
    expect(book).toMatch(/update verification_series set next_number/i);
  });

  it("verifikationen bär tidpunkt, händelsedatum, beskrivning, motpart och nummer [BFL 5:7]", () => {
    const table = createTableBody("verifications");
    for (const col of ["registered_at", "verification_date", "description", "counterparty", "number"]) {
      expect(table, `verifications saknar ${col}`).toContain(col);
    }
  });
});

// ==========================================================================
// 3. OFÖRÄNDERLIGHET OCH RÄTTELSE  [BFNAR 2.1, 2.17, 2.18, BFL 5:5]
// ==========================================================================

describe("Oföränderlighet och rättelse", () => {
  it("bokförda verifikat kan inte raderas [BFNAR 2.1, BFL 7:6]", () => {
    const del = effectiveFn("verifications_restrict_delete").body;
    expect(del).toMatch(/raise\s+exception/i);
    expect(del, "radering får inte vara villkorad").not.toMatch(/if\s+.*then[\s\S]*return\s+old/i);
  });

  it("bokförda verifikat kan inte ändras — utom länken till ändringsverifikatet [BFNAR 2.17]", () => {
    const upd = effectiveFn("verifications_block_update").body;
    expect(upd).toMatch(/corrected_by_id/);
    for (const col of ["series_id", "number", "verification_date", "description", "source"]) {
      expect(upd, `${col} måste vara låst vid UPDATE`).toContain(col);
    }
  });

  it("verifikatrader kan varken ändras eller raderas separat [BFNAR 2.1]", () => {
    const rows = effectiveFn("verification_rows_block_mutation").body;
    expect(rows).toMatch(/raise\s+exception/i);
    expect(triggersOn("verification_rows").join(" ")).toMatch(/before\s+update\s+or\s+delete/i);
  });

  it("rättelse sker som en NY bokföringspost med egen verifikation [BFNAR 2.18]", () => {
    const corr = effectiveFn("correct_verification").body;
    expect(corr).toMatch(/book_verification\(/);
    expect(corr).toMatch(/'correction'/);
    expect(corr).toMatch(/corrected_by_id/);
  });

  it("originalet kan bara rättas en gång och pekar ut rättelsen [BFL 5:5, BFNAR 5.15]", () => {
    const corr = effectiveFn("correct_verification").body;
    expect(corr).toMatch(/if\s+v_orig\.corrected_by_id\s+is\s+not\s+null\s+then[\s\S]*?raise\s+exception/i);
  });

  it("vändningens rader följer originalets registreringsordning [BFNAR 2.2, 2.3 a]", () => {
    const corr = effectiveFn("correct_verification").body;
    expect(
      corr,
      "jsonb_agg utan ORDER BY row_no ger rättelseverifikatet godtycklig radordning",
    ).toMatch(/jsonb_agg\([\s\S]*?order\s+by\s+row_no/i);
  });
});

// ==========================================================================
// 4. ARKIVERINGSSKYDDET FÖR UNDERLAG  [BFL 7:2, 7:6]
// ==========================================================================

describe("Underlag bevaras med verifikatet", () => {
  it("underlag kan inte kopplas loss från verifikatet och sedan raderas [BFL 7:2, 7:6]", () => {
    // attachments_restrict_delete tittar bara på DELETE. Med öppen skrivpolicy
    // och utan UPDATE-vakt räcker det att nolla verification_id först.
    const hasUpdateGuard = triggersOn("attachments").some((t) => /before[^;]*update/i.test(t));
    expect(
      hasUpdateGuard,
      "attachments.verification_id kan nollas via API:t, varefter arkiveringsskyddet inte gäller",
    ).toBe(true);
  });

  it("lagringsnyckeln kan inte skrivas om under arkivexporten [BFL 7:6]", () => {
    const body = effectiveFn("attachments_guard_update").body;
    expect(body).toMatch(/storage_path is distinct from old\.storage_path/i);
  });

  it("radnivåsäkerhet är påslagen på motorns tabeller", () => {
    for (const t of ["verifications", "verification_rows", "period_locks", "fiscal_years",
      "verification_series", "attachments"]) {
      expect(rlsEnabled(t), `RLS saknas på ${t}`).toBe(true);
    }
  });
});

// ==========================================================================
// 5. FÖRKONTROLLEN SPEGLAR MOTORNS BÅDA INVARIANTER
// ==========================================================================

describe("Appens förkontroll och motorn ger samma svar", () => {
  // book_verification har TVÅ spärrar efter summeringen:
  //   if v_debit <> v_credit then raise ... ;
  //   if v_debit = 0 then raise exception 'Verifikatet saknar belopp.';
  // Samma nollspärr ligger dessutom i verification_assert_balance. Förkontrollen
  // i bookVerification speglade bara den första, och rowSchema tillåter
  // debit/credit = 0 — så en hel klass indata godkändes av appen och avvisades
  // av motorn med exakt det kryptiska motorfel förkontrollen finns för att
  // undvika. En bokföringspost utan belopp är ingen affärshändelse [BFL 4:1].
  const nollfall: [string, { debit: number; credit: number; account: number }[]][] = [
    ["två nollrader", [row(6110, 0, 0), row(1930, 0, 0)]],
    ["0,004 mot 0,004", [row(6110, 0.004, 0), row(1930, 0, 0.004)]],
    ["0,0049 mot 0,0049", [row(6110, 0.0049, 0), row(1930, 0, 0.0049)]],
    ["1e-7 mot 1e-7", [row(6110, 1e-7, 0), row(1930, 0, 1e-7)]],
  ];

  for (const [namn, rows] of nollfall) {
    it(`${namn}: förkontrollen avvisar, motorn nås aldrig`, async () => {
      expect(pgBalances(rows), "motorn skulle avvisa det här").toBe(false);
      const res = await bookVerification({
        seriesCode: "A", date: "2026-03-15", description: "Utan belopp",
        source: "manual", rows,
      });
      expect(res).toHaveProperty("error");
      expect((res as { error: string }).error).toMatch(/saknar belopp/);
      expect(rpcCalls, "verifikatet ska aldrig ha nått motorn").toHaveLength(0);
    });
  }

  it("ett verkligt öresbelopp spärras inte av nollkontrollen", async () => {
    const rows = [row(6110, 0.01, 0), row(1930, 0.01, 0), row(3011, 0, 0.02)];
    expect(pgBalances(rows)).toBe(true);
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Öresbelopp", source: "manual", rows,
    });
    expect(res).not.toHaveProperty("error");
  });

  it("0,005 + 0,005 mot 0,01 avvisas av BÅDA — motorn rundar halvor från noll", async () => {
    // Postgres numeric(12,2) gör 0,005 till 0,01, alltså debet 0,02 mot kredit
    // 0,01. Förkontrollen räknar likadant sedan toKronor2 infördes, så app och
    // motor säger samma sak.
    const rows = [row(6110, 0.005, 0), row(1930, 0.005, 0), row(3011, 0, 0.01)];
    expect(pgBalances(rows)).toBe(false);
    const res = await bookVerification({
      seriesCode: "A", date: "2026-03-15", description: "Öresavrundning", source: "manual", rows,
    });
    expect(res).toHaveProperty("error");
    expect(rpcCalls).toHaveLength(0);
  });
});

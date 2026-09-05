import { afterAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateByraKey } from "../byra/keys";
import { exchangeByraKey, type ByraKeyRow, type ByraSession } from "../byra/exchange";
import { readByraStats, type ByraStatsRow } from "../byra/stats";

/**
 * Skarpt prov av byrånyckelns isolering mot en RIKTIG databas.
 *
 * Hoppas över om inte alla tre variablerna är satta — det ska aldrig kunna
 * råka köra mot din produktionsinstallation som följd av att någon annan
 * miljöfil lästes in:
 *
 *   BYRA_LIVE_URL=https://<ref>.supabase.co \
 *   BYRA_LIVE_SERVICE_KEY=... BYRA_LIVE_ANON_KEY=... \
 *   npx vitest run src/lib/__tests__/byra-live.integration.test.ts
 *
 * Provet skapar ett maskinkonto och en byrånyckel, växlar den, kontrollerar
 * vad token faktiskt når, återkallar nyckeln och kontrollerar att åtkomsten
 * upphör med den redan utfärdade token i handen. Städar efter sig.
 *
 * VARFÖR DET HÄR PROVET VÄGER TYNGRE I DEN HÄR UTGÅVAN. Varje tabell har
 * policyn "authenticated full access" (20260701000001). Ett maskinkonto som
 * slinker förbi spärrarna i 20260907000012 har därför inte "för mycket
 * åtkomst" — det har allt. Enhetsproven bevisar logiken; det här beviser att
 * databasen håller med.
 */

const URL_ = process.env.BYRA_LIVE_URL;
const SERVICE = process.env.BYRA_LIVE_SERVICE_KEY;
const ANON = process.env.BYRA_LIVE_ANON_KEY;
const live = Boolean(URL_ && SERVICE && ANON);

const admin: SupabaseClient | null = live
  ? createClient(URL_!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const created: {
  userId?: string;
  keyId?: string;
  humanId?: string;
  bankIds: string[];
  customerIds: string[];
} = { bankIds: [], customerIds: [] };

afterAll(async () => {
  if (!admin) return;
  if (created.customerIds.length) await admin.from("customers").delete().in("id", created.customerIds);
  if (created.bankIds.length) await admin.from("bank_transactions").delete().in("id", created.bankIds);
  if (created.keyId) await admin.from("byra_keys").delete().eq("id", created.keyId);
  if (created.userId) await admin.auth.admin.deleteUser(created.userId);
  if (created.humanId) await admin.auth.admin.deleteUser(created.humanId);
});

/**
 * En session för ett konto som INTE är en byrå. Kontrollgruppen.
 *
 * Utan den bevisar provet ingenting: "byrån ser noll rader" kan lika gärna
 * betyda att ingen ser något (en glömd GRANT, en tom tabell, ett fel i
 * uppkopplingen). Kontrollgruppen läser exakt samma tabeller med exakt samma
 * anon-nyckel och ska se raderna. Skillnaden mellan de två sessionerna är
 * spärrarna i 20260907000012 och ingenting annat.
 */
async function mintSessionFor(email: string): Promise<string> {
  const { data: link } = await admin!.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (!tokenHash) throw new Error("ingen engångslänk");
  const anon = createClient(URL_!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (!verified?.session?.access_token) throw new Error("ingen session");
  return verified.session.access_token;
}

function deps() {
  return {
    async findKeyByHash(hash: string): Promise<ByraKeyRow | null> {
      const { data, error } = await admin!
        .from("byra_keys")
        .select("id, agency_name, scopes, auth_user_id, revoked_at")
        .eq("key_hash", hash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ByraKeyRow | null) ?? null;
    },
    async mintSession(authUserId: string): Promise<ByraSession | null> {
      const { data: user } = await admin!.auth.admin.getUserById(authUserId);
      if (!user?.user?.email) return null;
      const { data: link } = await admin!.auth.admin.generateLink({
        type: "magiclink",
        email: user.user.email,
      });
      const tokenHash = link?.properties?.hashed_token;
      if (!tokenHash) return null;
      const anon = createClient(URL_!, ANON!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: verified } = await anon.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      const session = verified?.session;
      if (!session?.access_token) return null;
      await admin!.auth.admin.signOut(session.access_token, "global").catch(() => {});
      return {
        access_token: session.access_token,
        expires_in: session.expires_in ?? 3600,
        expires_at: session.expires_at ?? null,
      };
    },
    async markUsed(keyId: string) {
      await admin!.from("byra_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
    },
  };
}

const asByra = (jwt: string) =>
  createClient(URL_!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

/**
 * Tabeller som en byrånyckel aldrig får röra — hela public, som listan såg ut
 * när spärren skrevs.
 *
 * Att listan är fullständig NU är ett stickprov, inte garantin. Garantin är
 * att både RLS-spärren och skrivvakten läggs på i en loop över pg_tables
 * (20260907000012), vilket byra-sparr.test.ts håller fast. Landar en ny tabell
 * ska den läggas till här också — men glöms den, är den ändå spärrad.
 */
const FORBJUDNA = [
  "settings",
  "byra_keys",
  "verifications",
  "verification_rows",
  "verification_series",
  "attachments",
  "accounts",
  "customers",
  "suppliers",
  "supplier_invoices",
  "supplier_payments",
  "invoices",
  "invoice_rows",
  "invoice_payments",
  "invoice_reminders",
  "recurring_invoices",
  "invoice_counter",
  "articles",
  "bank_transactions",
  "bank_connections",
  "bank_rules",
  "posting_templates",
  "fiscal_years",
  "period_locks",
  "tax_deadlines",
  "vat_reports",
  "vat_codes",
  "vat_rates",
  "rule_values",
  "assets",
  "asset_depreciations",
  "trips",
  "year_end_closings",
  "tax_allocation_reserves",
  "tax_carryforwards",
  // Vyerna, som bär hela huvudboken med belopp och motparter. De är
  // security_invoker = true och ärver därför RLS från bastabellerna — men det
  // är en egenskap som kan slås av med en enda reloption, och en vy som körs
  // som ägare går förbi varje spärr i 20260907000012. Provas därför.
  "ledger_entries",
  "account_balances",
];

describe.skipIf(!live)("skarp växling mot riktig databas", () => {
  const nyckel = generateByraKey();
  let jwt = "";
  let humanJwt = "";

  test("kontrollgrupp: en vanlig inloggning ser och skriver i tabellerna", async () => {
    const { data: human, error } = await admin!.auth.admin.createUser({
      email: `manniska-${crypto.randomUUID()}@livetest.invalid`,
      email_confirm: true,
    });
    expect(error).toBeNull();
    created.humanId = human!.user!.id;
    humanJwt = await mintSessionFor(human!.user!.email!);

    const c = asByra(humanJwt);
    expect(await c.rpc("is_byra_machine").then((r) => r.data)).toBe(false);

    // Läser: seedade tabeller ska ge rader.
    for (const [table, minst] of [["accounts", 1], ["vat_codes", 1], ["settings", 1]] as const) {
      const { data, error: err } = await c.from(table).select("*").limit(5);
      expect(err, `${table}: ${err?.message}`).toBeNull();
      expect((data ?? []).length).toBeGreaterThanOrEqual(minst);
    }

    // Skriver: både direkt och genom en definer-RPC.
    const { data: kund, error: insErr } = await c
      .from("customers")
      .insert({ name: `kontrollgrupp-${crypto.randomUUID()}` })
      .select("id")
      .single();
    expect(insErr, insErr?.message).toBeNull();
    created.customerIds.push(kund!.id as string);

    const { error: rpcErr } = await c.rpc("assign_invoice_no");
    expect(rpcErr, rpcErr?.message).toBeNull();
  }, 30_000);

  test("nyckeln kan skapas och växlas", async () => {
    const email = `byra-${crypto.randomUUID()}@byra.invalid`;
    const { data: user, error: userErr } = await admin!.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    expect(userErr).toBeNull();
    created.userId = user!.user!.id;

    const { data: key, error: keyErr } = await admin!
      .from("byra_keys")
      .insert({
        agency_name: "Livetest Byrå AB",
        key_hash: nyckel.hash,
        key_prefix: nyckel.prefix,
        auth_user_id: created.userId,
      })
      .select("id")
      .single();
    expect(keyErr).toBeNull();
    created.keyId = key!.id;

    const res = await exchangeByraKey(deps(), `Bearer ${nyckel.key}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.scopes).toEqual(["stats:read"]);
    expect(res.body.agency).toBe("Livetest Byrå AB");
    jwt = res.body.access_token;
    expect(jwt.split(".")).toHaveLength(3);
  }, 30_000);

  /**
   * Foten som annars skjuts av. Spärrarna känner igen ett maskinkonto på att
   * det HAR en rad i byra_keys — så en rad som pekar på den egna inloggningen
   * stänger ute dig från din egen databas, utan väg tillbaka i gränssnittet.
   */
  test("en nyckel kan inte peka på den egna inloggningen", async () => {
    const c = asByra(humanJwt);
    const { error } = await c.from("byra_keys").insert({
      agency_name: "Jag själv AB",
      key_hash: "b".repeat(64),
      key_prefix: "dkb_zzzzzz",
      auth_user_id: created.humanId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("egen inloggning");

    // Och kontrollgruppen har fortfarande sin åtkomst i behåll.
    expect(await c.rpc("is_byra_machine").then((r) => r.data)).toBe(false);
    const { data } = await c.from("accounts").select("*").limit(1);
    expect((data ?? []).length).toBe(1);
  }, 30_000);

  test("token känns igen som maskinkonto och ser aggregatvyn", async () => {
    const c = asByra(jwt);
    expect(await c.rpc("is_byra_machine").then((r) => r.data)).toBe(true);
    expect(await c.rpc("byra_has_access").then((r) => r.data)).toBe(true);

    const { data: stats } = await c.from("byra_stats").select("*");
    expect(stats).toHaveLength(1);
    expect(typeof stats![0].schema_version).toBe("number");
    expect(stats![0].schema_version).toBeGreaterThan(0);
  }, 30_000);

  /**
   * Uppräkningen är avsiktligt hela tabellistan och inte ett urval. I en
   * utgåva där varje tabell lyder "authenticated full access" är en tabell som
   * glömts bort inte en mindre läcka — den är hela tabellen.
   */
  test.each(FORBJUDNA)("token ser INGA rader i %s", async (table) => {
    const { data } = await asByra(jwt).from(table).select("*").limit(5);
    expect(data ?? []).toHaveLength(0);
  }, 30_000);

  test("samma tabell som byrån nekas läser kontrollgruppen utan problem", async () => {
    // Parvis, i samma prov: skillnaden är sessionen, inte tabellen.
    for (const table of ["settings", "accounts", "vat_codes"]) {
      const byra = await asByra(jwt).from(table).select("*").limit(5);
      const manniska = await asByra(humanJwt).from(table).select("*").limit(5);
      expect(byra.data ?? [], `${table} läckte till byrån`).toHaveLength(0);
      expect((manniska.data ?? []).length, `${table} nekades kontrollgruppen`).toBeGreaterThan(0);
    }
  }, 30_000);

  /**
   * Huvudboken genom vyerna, med ett riktigt verifikat i botten.
   *
   * Provet ovan går på tomma tabeller för allt utom grunddata, och en tom
   * tabell bevisar ingenting om isolering. Här bokförs ett verifikat med
   * belopp och motpart, och sedan jämförs de två sessionerna på exakt de vyer
   * som skulle läcka mest: ledger_entries (varje konteringsrad) och
   * account_balances (saldot per konto).
   */
  test("huvudboken läcker inte genom vyerna", async () => {
    /**
     * Provet städar INTE efter sig, och det är inte slarv: verifikat går inte
     * att radera (20260907000002_immutable_delete), vilket är hela poängen med
     * en huvudbok. Därför bokförs bara om huvudboken är tom — i övriga
     * körningar används det som redan står där.
     */
    const { count } = await admin!
      .from("verifications")
      .select("id", { count: "exact", head: true });

    const motpart = "Motpart som inte ska synas AB";
    if (!count) {
      const { error: bokErr } = await admin!.rpc("book_verification", {
        p_series_code: "A",
        p_date: "2026-07-15",
        p_description: "byra-livetest kvitto",
        p_counterparty: motpart,
        p_rows: [
          { account: 6570, debit: 1250, credit: 0 },
          { account: 1930, debit: 0, credit: 1250 },
        ],
      });
      expect(bokErr, bokErr?.message).toBeNull();
    }

    for (const vy of ["ledger_entries", "account_balances"]) {
      const byra = await asByra(jwt).from(vy).select("*").limit(10);
      const manniska = await asByra(humanJwt).from(vy).select("*").limit(10);
      expect(byra.data ?? [], `${vy} läckte till byrån`).toHaveLength(0);
      expect((manniska.data ?? []).length, `${vy} nekades kontrollgruppen`).toBeGreaterThan(0);
      expect(JSON.stringify(byra.data ?? [])).not.toContain(motpart);
    }

    // Och aggregatet räknar verifikatet utan att visa det: ett datum, aldrig
    // ett belopp och aldrig en motpart.
    const res = await readByraStats(statsDeps(), `Bearer ${jwt}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.last_verification).not.toBeNull();
    const svar = JSON.stringify(res.body);
    expect(svar).not.toContain("1250");
    expect(svar).not.toContain(motpart);
  }, 30_000);

  test("token kan inte skriva — varken via PostgREST eller via en definer-RPC", async () => {
    const c = asByra(jwt);

    // Direkt skrivning: RLS-spärren.
    const { error: insertErr } = await c.from("customers").insert({ name: "byra-livetest" });
    expect(insertErr).not.toBeNull();

    // Via SECURITY DEFINER, där RLS inte gäller: skrivvakten som trigger.
    // Det här är vägen licensutgåvan stänger med assert_write_role() och som
    // en portering utan vakten hade lämnat vidöppen rakt in i huvudboken.
    const { error: bookErr } = await c.rpc("book_verification", {
      p_series_code: "A",
      p_date: "2026-08-15",
      p_description: "byra-livetest",
      p_rows: [
        { account: 6570, debit: 10, credit: 0 },
        { account: 1930, debit: 0, credit: 10 },
      ],
    });
    expect(bookErr).not.toBeNull();

    const { error: counterErr } = await c.rpc("assign_invoice_no");
    expect(counterErr).not.toBeNull();
  }, 30_000);

  test("token når inte underlagen i kvittoarkivet", async () => {
    // Ett tomt arkiv bevisar ingenting: "byrån ser inga filer" och "det finns
    // inga filer" ser likadana ut. Provet seedar därför ett underlag först och
    // låter kontrollgruppen hämta hem innehållet.
    //
    // Filen läggs upp som PDF eftersom bucketen bara tar emot de format
    // inkorgen faktiskt hanterar (20260908000003). Innehållet är fortfarande
    // en textsträng — provet handlar om vem som når filen, inte om formatet.
    const path = `livetest/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await admin!.storage
      .from("underlag")
      .upload(path, new Blob(["kvitto 123 kr"]), { contentType: "application/pdf" });
    expect(upErr).toBeNull();

    try {
      const byra = asByra(jwt).storage.from("underlag");
      const { data: byraList } = await byra.list("livetest");
      expect(byraList ?? []).toHaveLength(0);
      const { data: byraFil } = await byra.download(path);
      expect(byraFil).toBeNull();

      const manniska = asByra(humanJwt).storage.from("underlag");
      const { data: humanList } = await manniska.list("livetest");
      expect((humanList ?? []).length).toBeGreaterThan(0);
      const { data: humanFil } = await manniska.download(path);
      expect(await humanFil!.text()).toBe("kvitto 123 kr");
    } finally {
      await admin!.storage.from("underlag").remove([path]);
    }
  }, 30_000);

  test("last_used_at stämplades", async () => {
    const { data } = await admin!.from("byra_keys").select("last_used_at").eq("id", created.keyId!).single();
    expect(data!.last_used_at).not.toBeNull();
  }, 30_000);

  /**
   * /api/stats/byra mot samma databas.
   *
   * Enhetsproven i byra-stats.test.ts bevisar formen på svaret. Här bevisas
   * det enda de inte kan: att vyns aggregat är samma tal som en oberoende
   * räkning med service-nyckeln ger — och att talet FÖLJER MED när
   * verkligheten ändras. Ett svar som råkar stämma en gång bevisar inget;
   * ett svar som rör sig med exakt det som seedats gör det.
   */
  const statsDeps = () => ({
    async readStats(token: string) {
      const { data, error, status } = await asByra(token)
        .from("byra_stats")
        .select(
          "schema_version, period, unbooked_count, unmatched_bank, attachments_missing, " +
            "last_verification, period_locked_to, vat_due_date, " +
            "fiscal_year_start, fiscal_year_end, fiscal_year_status"
        )
        .limit(1);
      return {
        status,
        rows: (data as ByraStatsRow[] | null) ?? null,
        errorMessage: error?.message ?? null,
      };
    },
  });

  /** Oberoende räkning av samma sak, med service-nyckeln och utan vyn. */
  async function sant() {
    const omatchade = await admin!
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "unmatched");
    expect(omatchade.error).toBeNull();

    const inkorg = await admin!
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .is("verification_id", null);
    expect(inkorg.error).toBeNull();

    const senaste = await admin!
      .from("verifications")
      .select("verification_date")
      .order("verification_date", { ascending: false })
      .limit(1);
    expect(senaste.error).toBeNull();

    const unmatched = omatchade.count ?? 0;
    return {
      unmatched,
      unbooked: unmatched + (inkorg.count ?? 0),
      last_verification: senaste.data?.[0]?.verification_date ?? null,
    };
  }

  test("aggregatet stämmer med en oberoende räkning", async () => {
    const res = await readByraStats(statsDeps(), `Bearer ${jwt}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const facit = await sant();
    expect(res.body.unmatched_bank).toBe(facit.unmatched);
    expect(res.body.unbooked_count).toBe(facit.unbooked);
    expect(res.body.last_verification).toBe(facit.last_verification);

    // Kontraktet: perioden i portalens form, versionerna som två skilda tal.
    expect(res.body.period).toMatch(/^20\d{2}(0[1-9]|1[0-2])$/);
    expect(res.body.schema_version).toBe(1);
    expect(res.body.installation_schema_version).toBeGreaterThan(0);
    expect(res.body.fiscal_year).toHaveProperty("start");
    expect(res.body.fiscal_year).toHaveProperty("end");
    expect(res.body.fiscal_year).toHaveProperty("status");
  }, 30_000);

  test("seedade rader flyttar siffran med exakt sitt antal", async () => {
    const fore = await readByraStats(statsDeps(), `Bearer ${jwt}`);
    expect(fore.ok).toBe(true);
    if (!fore.ok) return;

    const rader = [1, 2, 3].map((n) => ({
      booking_date: "2026-08-0" + n,
      amount: -(100 + n),
      description: `byra-stats-livetest-${crypto.randomUUID()}`,
      status: "unmatched",
    }));
    const { data: inserted, error } = await admin!.from("bank_transactions").insert(rader).select("id");
    expect(error).toBeNull();
    created.bankIds = (inserted ?? []).map((r) => r.id as string);
    expect(created.bankIds).toHaveLength(3);

    const efter = await readByraStats(statsDeps(), `Bearer ${jwt}`);
    expect(efter.ok).toBe(true);
    if (!efter.ok) return;
    expect(efter.body.unmatched_bank).toBe(fore.body.unmatched_bank + 3);
    expect(efter.body.unbooked_count).toBe(fore.body.unbooked_count + 3);

    // En omatchad transaktion får inte se ut som ett saknat underlag.
    expect(efter.body.attachments_missing).toBe(fore.body.attachments_missing);
  }, 30_000);

  /**
   * period_locked_to är porteringens enda egna uträkning och därför den enda
   * siffran som inte kan lutas mot källan.
   *
   * Licensutgåvans period_locks bär ett datum. Här bär tabellen
   * (fiscal_year_id, month) där month är ett kalendermånadsnummer inom
   * räkenskapsåret. Vyn måste alltså räkna fram sista dagen själv, och en
   * uträkning som ser rimlig ut ("månad 7 blir 31 juli") är rimlig ända tills
   * någon har ett brutet räkenskapsår.
   */
  test("period_locked_to är sista dagen i den senast låsta månaden", async () => {
    const { data: fy } = await admin!
      .from("fiscal_years")
      .select("id, year, start_date")
      .order("year", { ascending: false })
      .limit(1)
      .single();

    const inserted: string[] = [];
    try {
      for (const month of [2, 7]) {
        const { data } = await admin!
          .from("period_locks")
          .insert({ fiscal_year_id: fy!.id, month })
          .select("id")
          .single();
        if (data) inserted.push(data.id as string);
      }

      const res = await readByraStats(statsDeps(), `Bearer ${jwt}`);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      // Senast låsta månaden är juli, inte februari: max, inte första bästa.
      const ar = new Date(fy!.start_date as string).getUTCFullYear();
      expect(res.body.period_locked_to).toBe(`${ar}-07-31`);
    } finally {
      if (inserted.length) await admin!.from("period_locks").delete().in("id", inserted);
    }
  }, 30_000);

  test("återkallelse biter på en REDAN utfärdad token", async () => {
    await admin!.from("byra_keys").update({ revoked_at: new Date().toISOString() }).eq("id", created.keyId!);

    const c = asByra(jwt);
    expect(await c.rpc("byra_has_access").then((r) => r.data)).toBe(false);
    const { data: stats } = await c.from("byra_stats").select("*");
    expect(stats ?? []).toHaveLength(0);

    const res = await exchangeByraKey(deps(), `Bearer ${nyckel.key}`);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.body.error).toBe("key_revoked");

    // Och läs-API:et med samma token i handen: no_access, inte ett tomt
    // aggregat med nollor. En portal som fick nollor hade ritat "allt klart"
    // för en klient den inte längre ser.
    const stats2 = await readByraStats(statsDeps(), `Bearer ${jwt}`);
    expect(stats2.ok).toBe(false);
    if (stats2.ok) return;
    expect(stats2.status).toBe(403);
    expect(stats2.body.error).toBe("no_access");
  }, 30_000);

  /**
   * Det fel som ser rätt ut. En återkallad nyckel får INTE falla tillbaka på
   * "authenticated full access" — då hade återkallningsknappen gjort byrån
   * mäktigare, inte svagare. Spärrarna frågar därför om kontot är en maskin,
   * inte om nyckeln lever.
   */
  test("en återkallad nyckel blir inte en vanlig inloggning", async () => {
    const c = asByra(jwt);
    expect(await c.rpc("is_byra_machine").then((r) => r.data)).toBe(true);

    for (const table of ["settings", "verifications", "customers", "byra_keys"]) {
      const { data } = await c.from(table).select("*").limit(5);
      expect(data ?? [], `${table} läckte efter återkallelse`).toHaveLength(0);
    }
    const { error: insertErr } = await c.from("customers").insert({ name: "byra-livetest-2" });
    expect(insertErr).not.toBeNull();
  }, 30_000);
});

import { describe, expect, test } from "vitest";
import {
  authenticateApiKey,
  secondsUntilNextHour,
  type ApiKeyRow,
  type AuthenticateDeps,
} from "../api/authenticate";
import { generateApiKey, hashApiKey } from "../api/keys";
import { apiErrorBody } from "../api/errors";

/**
 * Autentiseringen av en API-nyckel — kontraktet, prövat utan databas.
 *
 * Samma uppdelning som byråväxlingens prov: felkoderna och ORDNINGEN mellan
 * kontrollerna är kontrakt, och båda går att pröva med injicerade beroenden.
 * Det gör att provet fångar det som annars bara syns i produktion — till
 * exempel att en återkallad nyckel får en egen kod i stället för att bakas
 * ihop med en okänd nyckel, eller att scope-prövning inte är gratis.
 */

const GILTIG = generateApiKey();

function rad(over: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Webshoppen",
    scopes: ["data:read"],
    auth_user_id: "22222222-2222-4222-8222-222222222222",
    revoked_at: null,
    rate_limit_per_hour: 600,
    ...over,
  };
}

type Spar = { uppslag: number; kvot: number; session: number; stampling: number };

function deps(over: Partial<AuthenticateDeps> = {}, rowIn: ApiKeyRow | null = rad()) {
  const spar: Spar = { uppslag: 0, kvot: 0, session: 0, stampling: 0 };
  const d: AuthenticateDeps = {
    async findKeyByHash(hash) {
      spar.uppslag++;
      return hash === GILTIG.hash ? rowIn : null;
    },
    async consumeQuota() {
      spar.kvot++;
      return true;
    },
    async mintSession() {
      spar.session++;
      return { access_token: "jwt.jwt.jwt", expires_in: 3600, expires_at: null };
    },
    async markUsed() {
      spar.stampling++;
    },
    ...over,
  };
  return { d, spar };
}

const bearer = (k: string) => `Bearer ${k}`;

describe("nyckeln måste finnas och vara giltig", () => {
  test("en giltig nyckel ger en session och stämplar användningen", async () => {
    const { d, spar } = deps();
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "203.0.113.9" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.accessToken).toBe("jwt.jwt.jwt");
    expect(r.scopes).toEqual(["data:read"]);
    expect(spar.stampling).toBe(1);
  });

  test.each([
    ["", "utan huvud"],
    ["Bearer", "bara ordet Bearer"],
    ["Basic " + GILTIG.key, "fel schema"],
    ["Bearer dkb_" + "a".repeat(43), "en byrånyckel"],
    ["Bearer inte-en-nyckel", "skräp"],
  ])("avvisar %s (%s) som unauthorized", async (huvud) => {
    const { d } = deps();
    const r = await authenticateApiKey(d, huvud, { ip: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("unauthorized");
  });

  test("en felformad nyckel når aldrig databasen", async () => {
    // Formkontrollen sparar ett uppslag per felriktat anrop och säger inget
    // nytt utåt — svaret är detsamma som för en okänd nyckel.
    const { d, spar } = deps();
    await authenticateApiKey(d, "Bearer skräp", { ip: "x" });
    expect(spar.uppslag).toBe(0);
  });

  test("en okänd men välformad nyckel slås upp och avvisas", async () => {
    const { d, spar } = deps();
    const annan = generateApiKey();
    const r = await authenticateApiKey(d, bearer(annan.key), { ip: "x" });
    expect(spar.uppslag).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toBe("unauthorized");
  });

  test("uppslaget sker på hashen — nyckeln lämnar aldrig funktionen i klartext", async () => {
    let sedd = "";
    const { d } = deps({
      async findKeyByHash(hash) {
        sedd = hash;
        return rad();
      },
    });
    await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(sedd).toBe(hashApiKey(GILTIG.key));
    expect(sedd).not.toContain(GILTIG.key);
  });
});

describe("återkallelse är ett eget tillstånd, inte ett haveri", () => {
  test("en återkallad nyckel får key_revoked, inte unauthorized", async () => {
    const { d } = deps({}, rad({ revoked_at: "2026-09-01T10:00:00Z" }));
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("key_revoked");
    // Skillnaden är hela poängen: den som felsöker ska se att ägaren dragit
    // in nyckeln, inte leta efter ett fel som inte finns.
    expect(r.body.message).toMatch(/återkallad/i);
  });

  test("ett raderat maskinkonto behandlas som en återkallad nyckel", async () => {
    const { d } = deps({}, rad({ auth_user_id: null }));
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toBe("key_revoked");
  });

  test("en återkallad nyckel mintar aldrig en session", async () => {
    const { d, spar } = deps({}, rad({ revoked_at: "2026-09-01T10:00:00Z" }));
    await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(spar.session).toBe(0);
  });
});

describe("kvoten", () => {
  test("stänger med 429 och säger när man får komma tillbaka", async () => {
    const { d } = deps({ async consumeQuota() { return false; } });
    const r = await authenticateApiKey(d, bearer(GILTIG.key), {
      ip: "x",
      now: new Date("2026-09-05T10:20:00Z"),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(429);
    expect(r.body.error).toBe("rate_limited");
    expect(r.retryAfterSeconds).toBe(40 * 60);
    expect(r.body.detail?.limit_per_hour).toBe(600);
  });

  test("räknas FÖRE scope-kontrollen — annars vore scope-prövning gratis", async () => {
    /**
     * Med omvänd ordning kunde den som håller en läsnyckel kartlägga vilka
     * scopes som finns genom att räkna 403 mot 200, utan att förbruka
     * någonting. Ordningen är alltså ett skydd, inte en slump.
     */
    const { d, spar } = deps();
    const r = await authenticateApiKey(d, bearer(GILTIG.key), {
      ip: "x",
      scope: "ledger:write",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toBe("insufficient_scope");
    expect(spar.kvot, "kvoten räknades inte för ett scope-avvisat anrop").toBe(1);
  });

  test("en trasig räknare fäller inte ett giltigt anrop", async () => {
    // Kvoten skyddar mot massuttag, inte mot förfalskade nycklar. En hicka i
    // databasen ska inte bli driftstopp för varje integration.
    const { d } = deps({ async consumeQuota() { throw new Error("nere"); } });
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(true);
  });

  test("nyckelns eget tak används, inte ett globalt", async () => {
    let settTak = 0;
    const { d } = deps(
      { async consumeQuota(_id, limit) { settTak = limit; return true; } },
      rad({ rate_limit_per_hour: 120 })
    );
    await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(settTak).toBe(120);
  });

  test("nästa fönster börjar vid nästa hel timme", () => {
    expect(secondsUntilNextHour(new Date("2026-09-05T10:00:00Z"))).toBe(3600);
    expect(secondsUntilNextHour(new Date("2026-09-05T10:59:30Z"))).toBe(30);
    // Aldrig 0: ett Retry-After på noll ber om ett omedelbart omförsök.
    expect(secondsUntilNextHour(new Date("2026-09-05T10:59:59.9Z"))).toBeGreaterThan(0);
  });
});

describe("scopet", () => {
  test("en nyckel utan det begärda scopet får 403 med besked om vilket som saknas", async () => {
    const { d } = deps({}, rad({ scopes: ["data:read"] }));
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x", scope: "ledger:write" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("insufficient_scope");
    expect(r.body.detail?.required_scope).toBe("ledger:write");
    expect(r.body.detail?.key_scopes).toEqual(["data:read"]);
    expect(r.body.message).toMatch(/Bokföra/);
  });

  test("rätt scope släpps igenom", async () => {
    const { d } = deps({}, rad({ scopes: ["data:read", "ledger:write"] }));
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x", scope: "ledger:write" });
    expect(r.ok).toBe(true);
  });

  test("utan begärt scope duger varje giltig nyckel — det är vad meta bygger på", async () => {
    // Upptäcktsanropet måste fungera för varje nyckel, annars kan integratören
    // inte ta reda på vad den nyckel den håller faktiskt kan.
    const { d } = deps({}, rad({ scopes: ["intake:write"] }));
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scopes).toEqual(["intake:write"]);
  });

  test("en nyckel utan scopes alls når ingenting scopat", async () => {
    const { d } = deps({}, rad({ scopes: null }));
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x", scope: "data:read" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toBe("insufficient_scope");
  });
});

describe("sessionen och stämplingen", () => {
  test("utan session svarar rutten 503, inte 401 — nyckeln var ju giltig", async () => {
    const { d } = deps({ async mintSession() { return null; } });
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("token_unavailable");
  });

  test("en misslyckad stämpling fäller aldrig ett giltigt anrop", async () => {
    const { d } = deps({ async markUsed() { throw new Error("skrivfel"); } });
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(true);
  });

  test("avsändarens adress följer med till stämplingen", async () => {
    let sedd = "";
    const { d } = deps({ async markUsed(_id, ip) { sedd = ip; } });
    await authenticateApiKey(d, bearer(GILTIG.key), { ip: "203.0.113.9" });
    expect(sedd).toBe("203.0.113.9");
  });

  test("ett trasigt uppslag ger 503, inte 401", async () => {
    // 401 hade sagt "din nyckel är fel" om ett fel på vår sida, och skickat
    // integratören att felsöka på fel ställe.
    const { d } = deps({ async findKeyByHash() { throw new Error("nere"); } });
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });
});

describe("felkroppen", () => {
  test("bär alltid kod, mening och request_id", async () => {
    const { d } = deps({}, null);
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.body.error).toBeTruthy();
    expect(r.body.message).toBeTruthy();
    expect(r.body.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("samma request_id går att skicka in så hela svaret hänger ihop", async () => {
    const { d } = deps({}, null);
    const r = await authenticateApiKey(d, bearer(GILTIG.key), { ip: "x", requestId: "abc-123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.request_id).toBe("abc-123");
  });

  test("detail är alltid strukturerat, aldrig råtext", () => {
    const body = apiErrorBody("invalid_request", "Datumet går inte att läsa.", {
      detail: { field: "from", expected: "YYYY-MM-DD" },
    });
    expect(typeof body.detail).toBe("object");
    expect(body.detail).toEqual({ field: "from", expected: "YYYY-MM-DD" });
  });

  test("detail utelämnas när det inte finns något strukturerat att säga", () => {
    expect(apiErrorBody("unauthorized", "Nej.")).not.toHaveProperty("detail");
  });
});

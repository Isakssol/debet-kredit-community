import { describe, expect, test, vi } from "vitest";
import {
  BYRA_KEY_PREFIX,
  bearerToken,
  byraKeyPrefix,
  generateByraKey,
  hashByraKey,
  hashesEqual,
  isByraKey,
} from "../byra/keys";
import { exchangeByraKey, type ByraKeyRow, type ExchangeDeps } from "../byra/exchange";

const VALID = generateByraKey();

function row(over: Partial<ByraKeyRow> = {}): ByraKeyRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    agency_name: "Testbyrån AB",
    scopes: ["stats:read"],
    auth_user_id: "22222222-2222-4222-8222-222222222222",
    revoked_at: null,
    ...over,
  };
}

function deps(over: Partial<ExchangeDeps> = {}): ExchangeDeps {
  return {
    findKeyByHash: vi.fn(async () => row()),
    mintSession: vi.fn(async () => ({
      access_token: "eyJ.mock.token",
      expires_in: 3600,
      expires_at: 1788508174,
    })),
    markUsed: vi.fn(async () => {}),
    ...over,
  };
}

describe("nyckelformat", () => {
  test("genererad nyckel har prefix, 43 tecken hemlighet och egen hash", () => {
    const a = generateByraKey();
    const b = generateByraKey();
    expect(a.key.startsWith(BYRA_KEY_PREFIX)).toBe(true);
    expect(a.key.length).toBe(BYRA_KEY_PREFIX.length + 43);
    expect(isByraKey(a.key)).toBe(true);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  test("hashen är SHA-256 av hela nyckeln och går inte att vända", () => {
    expect(hashByraKey(VALID.key)).toBe(VALID.hash);
    expect(VALID.hash).not.toContain(VALID.key.slice(4, 20));
  });

  test("prefixet är prefix + sex tecken, resten av nyckeln syns aldrig", () => {
    expect(VALID.prefix).toBe(byraKeyPrefix(VALID.key));
    expect(VALID.prefix.length).toBe(BYRA_KEY_PREFIX.length + 6);
    expect(VALID.key.startsWith(VALID.prefix)).toBe(true);
    expect(VALID.prefix.length).toBeLessThan(VALID.key.length);
  });

  test.each([
    ["tom sträng", ""],
    ["saknar prefix", "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"],
    ["fel prefix", `dk_${"a".repeat(43)}`],
    ["för kort", `${BYRA_KEY_PREFIX}${"a".repeat(42)}`],
    ["för lång", `${BYRA_KEY_PREFIX}${"a".repeat(44)}`],
    ["otillåtet tecken", `${BYRA_KEY_PREFIX}${"a".repeat(42)}+`],
    ["blanksteg", `${BYRA_KEY_PREFIX}${"a".repeat(42)} `],
  ])("underkänner %s", (_namn, value) => {
    expect(isByraKey(value)).toBe(false);
  });

  test("bearerToken plockar ut token oavsett skiftläge och blanksteg", () => {
    expect(bearerToken(`Bearer ${VALID.key}`)).toBe(VALID.key);
    expect(bearerToken(`bearer ${VALID.key}  `)).toBe(VALID.key);
    expect(bearerToken(VALID.key)).toBe("");
    expect(bearerToken("Basic abc")).toBe("");
    expect(bearerToken(null)).toBe("");
    expect(bearerToken(undefined)).toBe("");
  });

  test("hashesEqual jämför lika och olika utan att kasta på olika längd", () => {
    expect(hashesEqual(VALID.hash, VALID.hash)).toBe(true);
    expect(hashesEqual(VALID.hash, "a".repeat(64))).toBe(false);
    expect(hashesEqual(VALID.hash, "kort")).toBe(false);
  });
});

describe("växling av byrånyckel", () => {
  test("giltig nyckel ger token, omfattning och byrånamn", async () => {
    const d = deps();
    const res = await exchangeByraKey(d, `Bearer ${VALID.key}`);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe("eyJ.mock.token");
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.expires_in).toBe(3600);
    expect(res.body.scopes).toEqual(["stats:read"]);
    expect(res.body.agency).toBe("Testbyrån AB");
    expect(d.markUsed).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  test("uppslaget sker på hashen — nyckeln lämnar aldrig rutten", async () => {
    const findKeyByHash = vi.fn(async () => row());
    await exchangeByraKey(deps({ findKeyByHash }), `Bearer ${VALID.key}`);
    expect(findKeyByHash).toHaveBeenCalledWith(VALID.hash);
    expect(findKeyByHash).not.toHaveBeenCalledWith(VALID.key);
  });

  test("okänd nyckel ger 401 unauthorized utan att röra sessionen", async () => {
    const d = deps({ findKeyByHash: vi.fn(async () => null) });
    const res = await exchangeByraKey(d, `Bearer ${generateByraKey().key}`);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(d.mintSession).not.toHaveBeenCalled();
    expect(d.markUsed).not.toHaveBeenCalled();
  });

  test("återkallad nyckel ger EGEN felkod — portalen ska visa återkallad, inte fel", async () => {
    const d = deps({ findKeyByHash: vi.fn(async () => row({ revoked_at: "2026-09-04T10:00:00Z" })) });
    const res = await exchangeByraKey(d, `Bearer ${VALID.key}`);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("key_revoked");
    expect(res.body.error).not.toBe("unauthorized");
    expect(d.mintSession).not.toHaveBeenCalled();
    expect(d.markUsed).not.toHaveBeenCalled();
  });

  test("raderat maskinkonto behandlas som återkallat, inte som fel", async () => {
    const d = deps({ findKeyByHash: vi.fn(async () => row({ auth_user_id: null })) });
    const res = await exchangeByraKey(d, `Bearer ${VALID.key}`);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.body.error).toBe("key_revoked");
    expect(d.mintSession).not.toHaveBeenCalled();
  });

  test.each([
    ["inget huvud", null],
    ["fel schema", "Basic hemlig"],
    ["felformad nyckel", "Bearer inte-en-nyckel"],
    ["tom bearer", "Bearer "],
  ])("%s ger 401 utan databasanrop", async (_namn, header) => {
    const d = deps();
    const res = await exchangeByraKey(d, header);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(d.findKeyByHash).not.toHaveBeenCalled();
  });

  test("databasfel ger 503, inte 401 — portalen ska inte tro att nyckeln dragits in", async () => {
    const d = deps({
      findKeyByHash: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    });
    const res = await exchangeByraKey(d, `Bearer ${VALID.key}`);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("token_unavailable");
  });

  test("session som inte kan skapas ger 503 och stämplar inte nyckeln som använd", async () => {
    const d = deps({ mintSession: vi.fn(async () => null) });
    const res = await exchangeByraKey(d, `Bearer ${VALID.key}`);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(503);
    expect(d.markUsed).not.toHaveBeenCalled();
  });

  test("misslyckad stämpling fäller inte en giltig växling", async () => {
    const d = deps({
      markUsed: vi.fn(async () => {
        throw new Error("update failed");
      }),
    });
    const res = await exchangeByraKey(d, `Bearer ${VALID.key}`);
    expect(res.ok).toBe(true);
  });

  test("inget svar innehåller nyckeln eller dess hash", async () => {
    for (const d of [
      deps(),
      deps({ findKeyByHash: vi.fn(async () => null) }),
      deps({ findKeyByHash: vi.fn(async () => row({ revoked_at: "2026-09-04T10:00:00Z" })) }),
    ]) {
      const res = await exchangeByraKey(d, `Bearer ${VALID.key}`);
      const serialiserat = JSON.stringify(res.body);
      expect(serialiserat).not.toContain(VALID.key);
      expect(serialiserat).not.toContain(VALID.hash);
    }
  });
});

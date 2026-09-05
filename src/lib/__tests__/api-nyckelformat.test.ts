import { describe, expect, test } from "vitest";
import {
  API_KEY_PREFIX,
  apiKeyPrefix,
  bearerToken,
  clientIp,
  generateApiKey,
  hashApiKey,
  isApiKey,
} from "../api/keys";
import { isByraKey } from "../byra/keys";
import {
  API_SCOPES,
  DEFAULT_SCOPES,
  SCOPE_DESCRIPTIONS,
  SCOPE_LABELS,
  describeScopes,
  isApiScope,
  isWriteScope,
} from "../api/scopes";

/**
 * Nyckelformatet och scope-vokabulären.
 *
 * Två egenskaper är värda ett eget prov och inte bara en kodkommentar:
 *
 *  1. `dk_live_` och `dkb_` måste vara ÖMSESIDIGT avvisande. Byråns nyckel och
 *     installationens nyckel bor i skilda tabeller och öppnar skilda saker.
 *     Accepterades den ena där den andra hörde hemma vore skillnaden mellan
 *     dem en tillfällighet i uppslaget i stället för ett beslut i formatet.
 *  2. Prefixet som sparas i klartext måste vara exakt så långt som
 *     check-villkoret i migrationen kräver. Går de isär slutar utfärdandet
 *     fungera vid ett constraint-fel som inte säger vad som är fel.
 */

describe("nyckelformatet", () => {
  test("en genererad nyckel känns igen av sitt eget prov", () => {
    for (let i = 0; i < 50; i++) {
      const { key } = generateApiKey();
      expect(isApiKey(key), `${key} avvisades av isApiKey`).toBe(true);
    }
  });

  test("hashen är SHA-256 i hex och matchar kolumnens villkor", () => {
    const { key, hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(key)).toBe(hash);
  });

  test("prefixet matchar check-villkoret i 20260908000005", () => {
      // key_prefix text not null check (key_prefix ~ '^dk_live_[A-Za-z0-9_-]{6}$')
    const { key, prefix } = generateApiKey();
    expect(prefix).toMatch(/^dk_live_[A-Za-z0-9_-]{6}$/);
    expect(apiKeyPrefix(key)).toBe(prefix);
    expect(key.startsWith(prefix)).toBe(true);
  });

  test("nyckeln har 256 bitars entropi och upprepar sig aldrig", () => {
    const sedda = new Set<string>();
    for (let i = 0; i < 200; i++) sedda.add(generateApiKey().key);
    expect(sedda.size).toBe(200);
  });

  test.each([
    ["", "tom sträng"],
    ["dk_live_", "bara prefixet"],
    ["dk_test_" + "a".repeat(43), "annan miljö i prefixet"],
    ["dk_live_" + "a".repeat(42), "ett tecken för kort"],
    ["dk_live_" + "a".repeat(44), "ett tecken för långt"],
    ["dk_live_" + "a".repeat(42) + "+", "tecken utanför base64url"],
    ["DK_LIVE_" + "a".repeat(43), "versaler i prefixet"],
    [" dk_live_" + "a".repeat(43), "inledande blanksteg"],
  ])("avvisar %s (%s)", (kandidat) => {
    expect(isApiKey(kandidat)).toBe(false);
  });

  test("de två nyckelformaten avvisar varandra", () => {
    const api = generateApiKey().key;
    expect(isApiKey(api)).toBe(true);
    expect(isByraKey(api), "en API-nyckel togs för en byrånyckel").toBe(false);

    const byra = "dkb_" + "a".repeat(43);
    expect(isByraKey(byra)).toBe(true);
    expect(isApiKey(byra), "en byrånyckel togs för en API-nyckel").toBe(false);
  });

  test("prefixet är det som står i migrationen", () => {
    expect(API_KEY_PREFIX).toBe("dk_live_");
  });
});

describe("bearer-huvudet", () => {
  test("läser token oavsett hur ordet Bearer skrivs", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("BEARER abc")).toBe("abc");
    expect(bearerToken("Bearer   abc  ")).toBe("abc");
  });

  test.each<[string | null | undefined, string]>([
    [null, "huvudet saknas"],
    [undefined, "huvudet är undefined"],
    ["", "tomt huvud"],
    ["abc", "utan schema"],
    ["Basic abc", "fel schema"],
  ])("ger tom sträng för %s (%s)", (huvud) => {
    expect(bearerToken(huvud)).toBe("");
  });
});

describe("avsändarens adress", () => {
  test("första adressen i x-forwarded-for vinner", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" });
    expect(clientIp(h)).toBe("203.0.113.9");
  });

  test("x-real-ip används när forwarded saknas", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  test("utan huvuden blir det okand i stället för tomt", () => {
    expect(clientIp(new Headers())).toBe("okand");
  });

  test("kapas till kolumnens 64 tecken", () => {
    // last_used_ip check (length(last_used_ip) <= 64). En godtyckligt lång
    // sträng i huvudet ska inte kunna fälla en stämpling som annars lyckats.
    const h = new Headers({ "x-forwarded-for": "9".repeat(500) });
    expect(clientIp(h).length).toBe(64);
  });
});

describe("scope-vokabulären", () => {
  test("är två ord, och båda har etikett och beskrivning", () => {
    expect(API_SCOPES).toEqual(["data:read", "ledger:write"]);
    for (const s of API_SCOPES) {
      expect(SCOPE_LABELS[s], `${s} saknar etikett`).toBeTruthy();
      expect(SCOPE_DESCRIPTIONS[s], `${s} saknar beskrivning`).toBeTruthy();
    }
  });

  test("förvalet är enbart läsning", () => {
    expect(DEFAULT_SCOPES).toEqual(["data:read"]);
    expect(DEFAULT_SCOPES.some(isWriteScope), "förvalet innehåller ett skrivscope").toBe(false);
  });

  test("skrivscopet är det enda som ändrar något", () => {
    expect(isWriteScope("data:read")).toBe(false);
    expect(isWriteScope("ledger:write")).toBe(true);
  });

  test("okända ord känns inte igen", () => {
    // intake:write hör till licensutgåvans orderintag och e-fakturaingång.
    // Den här utgåvan har ingen av dem, och ett scope utan en väg bakom sig
    // är ett löfte utan täckning.
    for (const ord of ["", "read", "intake:write", "data:write", "ledger:read", "admin", "*"]) {
      expect(isApiScope(ord), `${ord} togs för ett giltigt scope`).toBe(false);
    }
  });

  test("meningen under kryssrutorna säger både vad nyckeln kan och inte kan", () => {
    const bara = describeScopes(["data:read"]);
    expect(bara).toContain("läsa");
    expect(bara).toContain("kan inte");
    expect(bara).toContain("bokföra");
    // Löftet om räckvidd står i varje variant, inte bara i den snällaste.
    expect(bara).toContain("företagsuppgifter");

    const allt = describeScopes([...API_SCOPES]);
    expect(allt).not.toContain("kan inte");
    expect(allt).toContain("företagsuppgifter");
  });

  test("ingen vald behörighet ber om ett val i stället för att påstå något", () => {
    expect(describeScopes([])).toBe("Välj minst en behörighet.");
  });

  test("ordningen i meningen följer vokabulären, inte klickordningen", () => {
    // Annars beror texten på i vilken ordning kryssrutorna råkade tryckas.
    expect(describeScopes(["ledger:write", "data:read"])).toBe(
      describeScopes(["data:read", "ledger:write"])
    );
  });
});

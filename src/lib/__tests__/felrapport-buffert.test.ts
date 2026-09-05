import { describe, it, expect, beforeEach } from "vitest";
import {
  CLIENT_ERROR_LIMITS, clearClientErrors, readClientErrors, recordClientError, sameOriginPath,
} from "@/lib/client-errors";

const T0 = Date.UTC(2026, 8, 5, 12, 0, 0);

beforeEach(() => clearClientErrors());

describe("klientfelbufferten — tak", () => {
  it("håller sig till 25 poster och kastar de äldsta först", () => {
    for (let i = 0; i < 40; i++) {
      recordClientError({ kind: "error", message: `fel nummer ${i}` }, T0 + i * 10_000);
    }
    const entries = readClientErrors(T0 + 40 * 10_000);
    expect(entries).toHaveLength(CLIENT_ERROR_LIMITS.entries);
    expect(entries[0].message).toBe("fel nummer 15");
    expect(entries.at(-1)!.message).toBe("fel nummer 39");
  });

  it("kapar långa meddelanden", () => {
    recordClientError({ kind: "error", message: "x".repeat(5000) }, T0);
    const [entry] = readClientErrors(T0);
    expect(entry.message).toHaveLength(CLIENT_ERROR_LIMITS.messageChars);
    expect(entry.message.endsWith("…")).toBe(true);
  });

  it("ryms i bytetaket även i värsta fall", () => {
    // Värsta tänkbara buffert: fullt antal poster, alla maximalt långa.
    // Antalstaket biter först — bytetaket är garantin endpointen räknar med.
    for (let i = 0; i < 40; i++) {
      recordClientError(
        { kind: "error", message: `${i} ${"x".repeat(600)}`, source: "y".repeat(300) },
        T0 + i * 10_000,
      );
    }
    const entries = readClientErrors(T0 + 400_000);
    const bytes = entries.reduce((sum, e) => sum + e.message.length + e.source.length + 60, 0);
    expect(entries).toHaveLength(CLIENT_ERROR_LIMITS.entries);
    expect(bytes).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.totalBytes);
    expect(JSON.stringify(entries).length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.totalBytes);
  });

  it("släpper poster som fallit ur trettiominutersfönstret", () => {
    recordClientError({ kind: "error", message: "gammalt fel" }, T0);
    recordClientError({ kind: "error", message: "färskt fel" }, T0 + 29 * 60_000);
    const entries = readClientErrors(T0 + 31 * 60_000);
    expect(entries.map((e) => e.message)).toEqual(["färskt fel"]);
  });
});

describe("klientfelbufferten — avduplicering", () => {
  it("gör en kastande loop till en rad med antal", () => {
    for (let i = 0; i < 4000; i++) {
      recordClientError(
        { kind: "error", message: "TypeError: x is not a function", source: "app.js:1:1" },
        T0 + i,
      );
    }
    const entries = readClientErrors(T0 + 4000);
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(4000);
    expect(entries[0].at).toBe(new Date(T0).toISOString());
  });

  it("skiljer på fel som bara liknar varandra", () => {
    recordClientError({ kind: "error", message: "samma", source: "a.js" }, T0);
    recordClientError({ kind: "error", message: "samma", source: "b.js" }, T0 + 100);
    recordClientError({ kind: "network", message: "samma", source: "a.js" }, T0 + 200);
    expect(readClientErrors(T0 + 300)).toHaveLength(3);
  });

  it("startar en ny rad när det gått mer än fem sekunder", () => {
    recordClientError({ kind: "error", message: "samma fel" }, T0);
    recordClientError({ kind: "error", message: "samma fel" }, T0 + 6_000);
    const entries = readClientErrors(T0 + 6_000);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.count === 1)).toBe(true);
  });
});

describe("klientfelbufferten — vitlistad form och sanering", () => {
  it("saneras INNAN den lagras, inte före utskicket", () => {
    recordClientError(
      { kind: "error", message: "Kunde inte bokföra 12 500,00 kr för anna@kund.se" },
      T0,
    );
    const [entry] = readClientErrors(T0);
    expect(entry.message).toBe("Kunde inte bokföra ••• kr för ••••@kund.se");
  });

  it("har exakt fem fält — inget kan slinka med", () => {
    recordClientError({ kind: "rejection", message: "avvisat löfte", source: "x.js" }, T0);
    const [entry] = readClientErrors(T0);
    expect(Object.keys(entry).sort()).toEqual(["at", "count", "kind", "message", "source"]);
  });

  it("ignorerar tomma meddelanden", () => {
    recordClientError({ kind: "error", message: "   " }, T0);
    recordClientError({ kind: "error", message: undefined }, T0);
    expect(readClientErrors(T0)).toHaveLength(0);
  });
});

describe("sameOriginPath", () => {
  const origin = "https://kund.example.se";

  it("plockar sökvägen ur egna anrop och kastar querysträngen", () => {
    expect(sameOriginPath("/api/fakturor?kund=4711&belopp=12500", origin)).toBe("/api/fakturor");
    expect(sameOriginPath(`${origin}/api/moms`, origin)).toBe("/api/moms");
    expect(sameOriginPath(new URL(`${origin}/api/bank#hash`), origin)).toBe("/api/bank");
  });

  it("rör aldrig externa anrop — deras URL:er är nycklade", () => {
    expect(sameOriginPath("https://abc.supabase.co/rest/v1/verifications?apikey=hemlig", origin)).toBeNull();
    expect(sameOriginPath("https://debea.se/api/feedback", origin)).toBeNull();
    expect(sameOriginPath("https://api.stripe.com/v1/charges", origin)).toBeNull();
  });

  it("ger null för det den inte förstår i stället för att gissa", () => {
    expect(sameOriginPath(undefined, origin)).toBeNull();
    expect(sameOriginPath(42, origin)).toBeNull();
    expect(sameOriginPath({}, origin)).toBeNull();
    expect(sameOriginPath("//abc.supabase.co/rest/v1", origin)).toBeNull();
  });
});

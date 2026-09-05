import { describe, expect, test } from "vitest";
import { base32Decode, totp, totpFromBytes } from "./helpers/totp";

/**
 * Provet av provverktyget.
 *
 * E2e-provet av tvåstegsverifieringen räknar ut koder med helpers/totp.ts. Om
 * den räknade fel skulle ett grönt e2e-prov bara betyda att vår felaktiga kod
 * råkar stämma överens med vår felaktiga uppfattning om vad Supabase svarar —
 * och det är precis den sortens prov som inte upptäcker någonting.
 *
 * Vektorerna nedan är RFC 6238:s egna (appendix B), med hemligheten
 * "12345678901234567890" och åtta siffror. De är inte påhittade av oss, och
 * det är hela deras värde: de kommer från samma standard som telefonens app
 * följer.
 */

// RFC 6238 appendix B — ASCII-hemligheten är samma i alla rader.
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("TOTP-hjälparen mot RFC 6238:s testvektorer", () => {
  test.each([
    [59, "94287082"],
    [1_111_111_109, "07081804"],
    [1_111_111_111, "14050471"],
    [1_234_567_890, "89005924"],
    [2_000_000_000, "69279037"],
    [20_000_000_000, "65353130"],
  ])("t=%i ger %s", (t, expected) => {
    expect(totpFromBytes(RFC_SECRET, { t, digits: 8 })).toBe(expected);
  });

  test("sex siffror är de sex sista av åtta", () => {
    expect(totpFromBytes(RFC_SECRET, { t: 59, digits: 6 })).toBe("287082");
  });

  test("koden är densamma hela fönstret ut och byts vid gränsen", () => {
    const iFönstret = totpFromBytes(RFC_SECRET, { t: 60 });
    expect(totpFromBytes(RFC_SECRET, { t: 89 })).toBe(iFönstret);
    expect(totpFromBytes(RFC_SECRET, { t: 90 })).not.toBe(iFönstret);
  });
});

describe("base32Decode", () => {
  test("avkodar RFC 4648:s exempel", () => {
    // "12345678901234567890" i base32 — samma hemlighet som ovan, i det
    // format Supabase lämnar den.
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")).toEqual(RFC_SECRET);
  });

  test("struntar i mellanslag och utfyllnad, som apparna gör", () => {
    const utan = base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ")).toEqual(utan);
    expect(base32Decode("gezdgnbvgy3tqojqgezdgnbvgy3tqojq")).toEqual(utan);
  });

  test("en nyckel med skräptecken avvisas i stället för att ge fel kod", () => {
    // Tyst avkodning av ogiltiga tecken vore värre än ett kastat fel: provet
    // skulle räkna ut EN kod, bara inte rätt kod.
    expect(() => base32Decode("GEZD1NBV")).toThrow();
  });

  test("hela vägen: base32-nyckel in, kod ut", () => {
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", { t: 59, digits: 8 })).toBe("94287082");
  });
});

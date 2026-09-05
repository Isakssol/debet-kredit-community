/**
 * GOLDEN: SIE-filen — teckenuppsättning, maskering, balanskontinuitet.
 *
 * Testerna kodar SPECIFIKATIONENS och LAGENS förväntade värden, inte kodens
 * nuvarande beteende. Ett rött test är ett fynd i produkten, inte i testet.
 *
 * PRIMÄRKÄLLOR
 *
 * [SIE 5.7]  SIE-formatspecifikation 4B, punkt 5.7: "Quotation marks in export
 *            fields are to be preceded by a backslash (ASCII 92)" samt "There
 *            are to be no control characters in text strings." Specens eget
 *            exempel i 10.15: #KONTO 1915 "Kassa \"special\"".
 * [SIE 5.8]  SIE 4B punkt 5.8: "The character set used in the file is to be
 *            IBM PC 8-bits extended ASCII (Codepage 437)."
 * [SIE 5.16] SIE 4B punkt 5.16: "Either #UB for the previous year or #IB for
 *            the current year is to be present."
 * [ÅRL 2:4]  Årsredovisningslag (1995:1554) 2 kap. 4 § 1 st p. 7: "Den
 *            ingående balansen för ett räkenskapsår ska stämma överens med den
 *            utgående balansen för det närmast föregående räkenskapsåret."
 * [ÅRL 3:5]  ÅRL 3 kap. 5 §: jämförelsetal för närmast föregående räkenskapsår.
 * [BFL 4:1]  Bokföringslag (1999:1078) 4 kap. 1 §: varje affärshändelse bokförs
 *            en gång.
 * [BFL 7:1]  BFL 7 kap. 1–2 §: räkenskapsinformation ska bevaras i läsbar form
 *            under hela arkiveringstiden.
 */
import { describe, expect, test } from "vitest";
import iconv from "iconv-lite";

import { generateSie4, toPc8, type SieData } from "@/lib/sie/export";
import { parseSie, decodeSieBuffer, detectSieEncoding } from "@/lib/sie/import";

// ---------------------------------------------------------------------------
// Testhjälp
// ---------------------------------------------------------------------------

const base: SieData = {
  companyName: 'Åkeri & "Bygg" i Västerås AB',
  orgNumber: "5566778899",
  generatedDate: "20260902",
  fiscalYear: { year: 2026, start: "2026-01-01", end: "2026-12-31" },
  accounts: [
    { number: 1930, name: "Företagskonto" },
    { number: 2091, name: "Balanserat resultat" },
    { number: 2440, name: "Leverantörsskulder" },
    { number: 3011, name: "Försäljning tjänster 25 %" },
    { number: 6072, name: 'Representation, "ej avdragsgill"' },
  ],
  openingBalances: [
    { account: 1930, amount: 112020.5 },
    { account: 2091, amount: -100000 },
    { account: 2440, amount: -25000.5 },
  ],
  closingBalances: [{ account: 1930, amount: 130000 }],
  results: [{ account: 3011, amount: -12000 }],
  verifications: [
    {
      series: "A", number: 1, date: "2026-08-15",
      description: "Lunch med kund — offertmöte, 2 pers",
      registeredDate: "2026-08-15",
      rows: [
        { account: 6072, amount: 480 },
        { account: 1930, amount: -480 },
      ],
    },
    {
      series: "A", number: 2, date: "2026-09-01",
      description: 'Hyra "september", banköverföring',
      registeredDate: "2026-09-01",
      rows: [
        { account: 2440, amount: 12000 },
        { account: 1930, amount: -12000 },
      ],
    },
  ],
};

const sieOf = (over: Partial<SieData> = {}) => generateSie4({ ...base, ...over });

// ===========================================================================
// A. Teckenuppsättningen  [SIE 5.8, BFL 7:1]
// ===========================================================================

describe("A. Filen ryms i PC8/CP437 — inget tecken tappas tyst [SIE 5.8, BFL 7:1]", () => {
  test("A1: hela filen går att koda till CP437 utan att bli frågetecken", () => {
    // Filen skrivs till disk med iconv.encode(..., 'cp437') i export/sie och
    // export/arkiv. Ett tecken som saknas i CP437 blir "?" DÄR, utan varning.
    // Translittereringen sker därför medvetet innan raderna byggs.
    const sie = sieOf();
    const roundtrip = iconv.decode(iconv.encode(sie, "cp437"), "cp437");
    expect(roundtrip).toBe(sie);
  });

  test("A2: tankstreck blir bindestreck, inte frågetecken", () => {
    expect(toPc8("Lunch med kund — offertmöte")).toBe("Lunch med kund - offertmöte");
    expect(sieOf()).toContain("Lunch med kund - offertm");
  });

  test("A3: svenska åäöÅÄÖ finns i CP437 och lämnas orörda", () => {
    expect(toPc8("Åkeri Öst ÄB åäö")).toBe("Åkeri Öst ÄB åäö");
  });

  test("A4: typografiska tecken translittereras till sina PC8-motsvarigheter", () => {
    expect(toPc8("“citerat”")).toBe('"citerat"');
    expect(toPc8("‘enkelt’")).toBe("'enkelt'");
    expect(toPc8("100 €")).toBe("100 EUR");
    expect(toPc8("och så vidare…")).toBe("och så vidare...");
    expect(toPc8("Małgorzata")).toBe("Malgorzata");
  });

  test("A5: en bokstav med diakrit som CP437 saknar tappar diakriten, inte bokstaven", () => {
    expect(toPc8("Dvořák")).toBe("Dvorák"); // á finns i CP437, ř gör inte
  });
});

// ===========================================================================
// B. Maskering av citattecken  [SIE 5.7, BFL 7:1]
// ===========================================================================

describe("B. Citattecken maskeras med bakstreck, byts aldrig ut [SIE 5.7]", () => {
  test("B1: exporten skriver \\\" precis som specens eget exempel (10.15)", () => {
    const sie = sieOf();
    expect(sie).toContain('#FNAMN "Åkeri & \\"Bygg\\" i Västerås AB"');
    expect(sie).toContain('#KONTO 6072 "Representation, \\"ej avdragsgill\\""');
  });

  test("B2: importen läser tillbaka texten ORDAGRANT", () => {
    const parsed = parseSie(sieOf());
    expect(parsed.companyName).toBe('Åkeri & "Bygg" i Västerås AB');
    expect(parsed.accounts.find((a) => a.number === 6072)?.name)
      .toBe('Representation, "ej avdragsgill"');
    expect(parsed.verifications[1].description).toBe('Hyra "september", banköverföring');
  });

  test("B3: ett maskerat citattecken kapar inte fältet", () => {
    const parsed = parseSie('#KONTO 1915 "Kassa \\"special\\""\n');
    expect(parsed.accounts).toEqual([{ number: 1915, name: 'Kassa "special"' }]);
  });

  test("B4: inga styrtecken når ett textfält [SIE 5.7]", () => {
    // "There are to be no control characters in text strings." Radbrytning och
    // tabb är postavskiljare i filen, inte innehåll — de blir mellanslag.
    // Övriga styrtecken har ingen PC8-motsvarighet och markeras med "?"; de
    // försvinner alltså inte tyst, och filen förblir läsbar (BFL 7 kap. 1–2 §).
    const sie = sieOf({ companyName: "Rad\tett\nmed\u0001styrtecken" });
    const fnamn = /#FNAMN "([^"]*)"/.exec(sie)![1];
    expect(fnamn).toBe("Rad ett med?styrtecken");
    expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(sie)).toBe(false);
  });
});

// ===========================================================================
// C. Balanskontinuitet — inget bokförs två gånger  [ÅRL 2:4, BFL 4:1]
// ===========================================================================

describe("C. Ingående balans skrivs som #IB, aldrig också som #VER [ÅRL 2:4, BFL 4:1]", () => {
  test("C1: en rundtur ger tillbaka exakt de ingående balanserna", () => {
    // Skrivs balanserna både som #IB och som ett vanligt #VER bokför varje
    // program som läser filen — vår egen import inkluderad — dem två gånger.
    // Allt dubbleras symmetriskt, så balansräkningen balanserar ändå och en
    // avstämning visar ingenting; bara beloppen är fel.
    const parsed = parseSie(sieOf());
    expect(parsed.openingBalances).toEqual([
      { account: 1930, amount: 112020.5 },
      { account: 2091, amount: -100000 },
      { account: 2440, amount: -25000.5 },
    ]);
    expect(parsed.openingBalancesFrom).toBe("ib");
  });

  test("C2: verifikatlistan innehåller inga öppningsbalansposter", () => {
    const parsed = parseSie(sieOf());
    // Ingen verifikatrad rör 2091 — kontot finns bara i #IB.
    expect(parsed.verifications.flatMap((v) => v.rows).some((r) => r.account === 2091)).toBe(false);
  });

  test("C3: varje verifikat balanserar och kommer tillbaka radvis", () => {
    const parsed = parseSie(sieOf());
    expect(parsed.verifications).toHaveLength(2);
    for (const v of parsed.verifications) {
      expect(v.rows.reduce((s, r) => s + r.amount, 0)).toBe(0);
    }
    expect(parsed.verifications[0].rows).toEqual([
      { account: 6072, amount: 480 },
      { account: 1930, amount: -480 },
    ]);
  });

  test("C4: #UB 0 och #RES 0 följer med och läses tillbaka", () => {
    const parsed = parseSie(sieOf());
    expect(parsed.closingBalances).toEqual([{ account: 1930, amount: 130000 }]);
    expect(parsed.results).toEqual([{ account: 3011, amount: -12000 }]);
  });

  test("C5: jämförelseåret skrivs som #RAR -1, #UB -1 och #RES -1 [ÅRL 3:5, SIE 5.16]", () => {
    const sie = sieOf({
      previousYear: { year: 2025, start: "2025-01-01", end: "2025-12-31" },
      previousClosing: [{ account: 1930, amount: 112020.5 }],
      previousResults: [{ account: 3011, amount: -8000 }],
    });
    expect(sie).toContain("#RAR -1 20250101 20251231");
    expect(sie).toContain("#UB -1 1930 112020.50");
    expect(sie).toContain("#RES -1 3011 -8000.00");
  });

  test("C6: en fil utan #IB 0 tar sin ingående balans ur #UB -1 [SIE 5.16, ÅRL 2:4]", () => {
    // En spec-enlig fil får sakna #IB 0 så länge #UB -1 finns. Utan den regeln
    // importeras den med noll i ingående balans, utan ett ord till användaren.
    const parsed = parseSie(`#FLAGGA 0
#SIETYP 4
#RAR 0 20260101 20261231
#RAR -1 20250101 20251231
#UB -1 1930 112020.50
#UB -1 2091 -100000.00
`);
    expect(parsed.openingBalances).toEqual([
      { account: 1930, amount: 112020.5 },
      { account: 2091, amount: -100000 },
    ]);
    expect(parsed.openingBalancesFrom).toBe("ub-previous");
  });

  test("C7: när #IB 0 finns används den, inte #UB -1", () => {
    const parsed = parseSie(`#FLAGGA 0
#IB 0 1930 500.00
#UB -1 1930 999.00
`);
    expect(parsed.openingBalances).toEqual([{ account: 1930, amount: 500 }]);
    expect(parsed.openingBalancesFrom).toBe("ib");
  });
});

// ===========================================================================
// D. Kodningsdetektering  [SIE 5.8, BFL 7:1]
// ===========================================================================

describe("D. Kodningen gissas rätt — annars blir kontoplanen teckenmos", () => {
  const text = "#FNAMN \"Åkeri Öst ÄB\"\r\n#ORGNR 5566778899\r\n";

  test("D1: PC8/CP437 är standardfallet [SIE 5.8]", () => {
    const buf = iconv.encode(text, "cp437");
    expect(detectSieEncoding(buf)).toBe("cp437");
    expect(decodeSieBuffer(buf)).toBe(text);
  });

  test("D2: UTF-8 känns igen på sina giltiga multibyte-sekvenser", () => {
    const buf = Buffer.from(text, "utf-8");
    expect(detectSieEncoding(buf)).toBe("utf-8");
    expect(decodeSieBuffer(buf)).toBe(text);
  });

  test("D3: ISO-8859-1/Windows-1252 från äldre program blir inte CP437-mos", () => {
    // Svensk text i CP437 har åäöÅÄÖ i 0x80–0x9F, i Latin-1 i 0xC0–0xFF.
    const buf = iconv.encode(text, "win1252");
    expect(detectSieEncoding(buf)).toBe("win1252");
    expect(decodeSieBuffer(buf)).toBe(text);
  });

  test("D4: ren ASCII avkodas likadant av alla tre", () => {
    const ascii = "#FLAGGA 0\r\n#SIETYP 4\r\n";
    for (const enc of ["cp437", "win1252"] as const) {
      expect(decodeSieBuffer(iconv.encode(ascii, enc))).toBe(ascii);
    }
    expect(decodeSieBuffer(Buffer.from(ascii, "utf-8"))).toBe(ascii);
  });

  test("D5: en UTF-8-BOM följer inte med in i första taggen", () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf-8")]);
    expect(decodeSieBuffer(buf).startsWith("#FNAMN")).toBe(true);
  });
});

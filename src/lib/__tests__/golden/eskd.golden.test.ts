import { describe, expect, test } from "vitest";
import {
  computeVatBoxes, generateEskd, formatEskdOrgNr, orgNumberIssue,
  validateEskdNote, normalizeEskdNote,
  type VatEntry, type VatBoxes,
} from "@/lib/vat/report";

/**
 * GOLDEN: eSKD-filen (momsdeklaration via filöverföring).
 *
 * Testerna kodar MYNDIGHETENS förväntade värden, inte kodens nuvarande
 * beteende. Ett rött test är ett fynd i produkten, inte i testet.
 *
 * PRIMÄRKÄLLA
 *
 * [SKV-FIL]  Skatteverket, "Lämna momsdeklaration via fil i e-tjänsten",
 *            avsnitten "Skapa en fil" (Rad 1–35), "Kontroll av mottagna
 *            uppgifter → Avvisande fel" samt Exempel 1–6.
 *            https://www.skatteverket.se/foretag/moms/deklareramoms/lamnamomsdeklarationviafilietjansten.4.2fb39afe18dabf1e4d223cc.html
 *
 * [SFF]      Skatteförfarandeförordning (2011:1261) 22 kap. 1 §: "Belopp som
 *            avser skatt eller avgift enligt skatteförfarandelagen (2011:1244)
 *            ska anges i hela krontal så att öretal faller bort."
 */

// ---------------------------------------------------------------------------
// Testhjälp
// ---------------------------------------------------------------------------

/** Rad i huvudboken. debit/credit i kronor, precis som ledger_entries. */
const row = (account: number, vatCode: string | null, debit: number, credit: number): VatEntry =>
  ({ account, vat_code: vatCode, debit, credit });

/** Taggarna inuti <Moms> i en eSKD-fil, i den ordning de står. */
const eskdTags = (xml: string): string[] => {
  const moms = /<Moms>([\s\S]*)<\/Moms>/.exec(xml)?.[1] ?? "";
  return [...moms.matchAll(/<([A-Za-z0-9]+)>[^<]*<\/\1>/g)].map((m) => m[1]);
};

/** Värdet för en tagg i eSKD-filen, som rå textsträng. */
const eskdValue = (xml: string, tag: string): string | null =>
  new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null;

/**
 * [SKV-FIL] "Skapa en fil": "De radnummer som står i tabellerna här nedanför
 * visar vilken ordning XML-taggarna ska ha i den färdiga filen." Rad 6–34.
 * Skriven ut här i sin helhet så testet inte lånar kodens egen BOX_ORDER.
 */
const SKV_TAG_ORDER = [
  "ForsMomsEjAnnan",        // Rad 6  — ruta 05
  "UttagMoms",              // Rad 7  — ruta 06
  "UlagMargbesk",           // Rad 8  — ruta 07
  "HyrinkomstFriv",         // Rad 9  — ruta 08
  "MomsUtgHog",             // Rad 10 — ruta 10
  "MomsUtgMedel",           // Rad 11 — ruta 11
  "MomsUtgLag",             // Rad 12 — ruta 12
  "InkopVaruAnnatEg",       // Rad 13 — ruta 20
  "InkopTjanstAnnatEg",     // Rad 14 — ruta 21
  "InkopTjanstUtomEg",      // Rad 15 — ruta 22
  "InkopVaruSverige",       // Rad 16 — ruta 23
  "InkopTjanstSverige",     // Rad 17 — ruta 24
  "MomsInkopUtgHog",        // Rad 18 — ruta 30
  "MomsInkopUtgMedel",      // Rad 19 — ruta 31
  "MomsInkopUtgLag",        // Rad 20 — ruta 32
  "ForsVaruAnnatEg",        // Rad 21 — ruta 35
  "ForsVaruUtomEg",         // Rad 22 — ruta 36
  "InkopVaruMellan3p",      // Rad 23 — ruta 37
  "ForsVaruMellan3p",       // Rad 24 — ruta 38
  "ForsTjSkskAnnatEg",      // Rad 25 — ruta 39
  "ForsTjOvrUtomEg",        // Rad 26 — ruta 40
  "ForsKopareSkskSverige",  // Rad 27 — ruta 41
  "ForsOvrigt",             // Rad 28 — ruta 42
  "MomsUlagImport",         // Rad 29 — ruta 50
  "MomsImportUtgHog",       // Rad 30 — ruta 60
  "MomsImportUtgMedel",     // Rad 31 — ruta 61
  "MomsImportUtgLag",       // Rad 32 — ruta 62
  "MomsIngAvdr",            // Rad 33 — ruta 48
  "MomsBetala",             // Rad 34 — ruta 49
];

const ORG = "556000-0175"; // [SKV-FIL] Rad 3, Skatteverkets eget (påhittade) exempel
const boxesFor = (o: Record<string, number>): VatBoxes => ({ ...o });

// ===========================================================================
// A. Filens struktur  [SKV-FIL "Skapa en fil"]
// ===========================================================================

describe("eSKD: struktur och obligatoriska rader  [SKV-FIL 'Skapa en fil']", () => {
  const xml = generateEskd(ORG, "2024-01-31", boxesFor({ "05": 100_000, "10": 25_000, "48": 5_000, "49": 20_000 }));

  test("Rad 1 är xml-deklarationen och Rad 2 är eSKDUpload — inget däremellan", () => {
    // Ingen DOCTYPE. Skatteverkets tabell har ingenting mellan Rad 1 och Rad 2,
    // och en extra rad faller på "En XML-tagg har angetts på ett annat sätt än
    // det format som avsnittet Skapa en fil beskriver" (avvisande fel).
    const lines = xml.trim().split("\n").map((l) => l.trim());
    expect(lines[0]).toBe('<?xml version="1.0" encoding="ISO-8859-1"?>');
    expect(lines[1]).toBe('<eSKDUpload Version="6.0">');
    expect(xml).not.toContain("DOCTYPE");
  });

  test("filen avslutas med </Moms> och </eSKDUpload>  [SKV-FIL 'Filens avslut']", () => {
    const lines = xml.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines.slice(-2)).toEqual(["</Moms>", "</eSKDUpload>"]);
  });

  test("OrgNr anges med 10 siffror i formatet xxxxxx-xxxx  [SKV-FIL Rad 3]", () => {
    // Fel format är ett AVVISANDE fel — filen går inte att ladda upp alls.
    // Inställningen kan innehålla ett organisationsnummer utan bindestreck
    // eller ett 12-siffrigt personnummer; båda måste normaliseras.
    for (const input of ["556000-0175", "5560000175", "198501012385", "19850101-2385"]) {
      const got = eskdValue(generateEskd(input, "2024-01-31", boxesFor({ "49": 0 })), "OrgNr");
      expect(got, `OrgNr från inställningen "${input}"`).toMatch(/^\d{6}-\d{4}$/);
    }
  });

  test("Period är ÅÅÅÅMM för periodens sista månad  [SKV-FIL Rad 5]", () => {
    expect(eskdValue(generateEskd(ORG, "2025-01-31", boxesFor({ "49": 0 })), "Period")).toBe("202501");
    expect(eskdValue(generateEskd(ORG, "2025-03-31", boxesFor({ "49": 0 })), "Period")).toBe("202503");
    expect(eskdValue(generateEskd(ORG, "2025-12-31", boxesFor({ "49": 0 })), "Period")).toBe("202512");
    expect(eskdValue(generateEskd(ORG, "2026-04-30", boxesFor({ "49": 0 })), "Period")).toBe("202604");
  });

  test("MomsBetala finns alltid med, även 0  [SKV-FIL Exempel 3]", () => {
    const tom = generateEskd(ORG, "2024-01-31", boxesFor({}));
    expect(eskdTags(tom)).toEqual(["Period", "MomsBetala"]);
    expect(eskdValue(tom, "MomsBetala")).toBe("0");
  });

  test("taggnamnen är Skatteverkets, en per ruta", () => {
    const alla = generateEskd(ORG, "2024-01-31", boxesFor({
      "05": 100_000, "06": 200_000, "07": 300_000, "08": 400_000,
      "10": 200_000, "11": 15_000, "12": 5_000,
      "20": 5_000, "21": 6_000, "22": 7_000, "23": 8_000, "24": 9_000,
      "30": 2_500, "31": 1_000, "32": 500,
      "35": 11_000, "36": 12_000, "37": 13_000, "38": 14_000,
      "39": 15_000, "40": 16_000, "41": 17_000, "42": 18_000,
      "50": 10_000, "60": 2_000, "61": 350, "62": 150,
      "48": 1_000, "49": 225_500,
    }));
    expect(eskdTags(alla)).toEqual(["Period", ...SKV_TAG_ORDER]);
  });

  test("radordningen följer Skatteverkets radnummer även när rutor saknas", () => {
    const xml2 = generateEskd(ORG, "2024-01-31", boxesFor({
      "42": 18_000, "10": 25_000, "50": 10_000, "05": 100_000, "48": 5_000, "49": 20_000, "20": 5_000,
    }));
    const tags = eskdTags(xml2).filter((t) => t !== "Period");
    const forvantad = SKV_TAG_ORDER.filter((t) => tags.includes(t));
    expect(tags).toEqual(forvantad);
  });

  test("belopp: bara siffror, minustecken direkt före, aldrig decimaler  [SFF 22:1]", () => {
    const xml2 = generateEskd(ORG, "2024-01-31", boxesFor({ "10": 25_000, "48": 55_000, "49": -30_000 }));
    for (const tag of eskdTags(xml2).filter((t) => t !== "Period")) {
      expect(eskdValue(xml2, tag), tag).toMatch(/^-?\d+$/);
    }
    expect(xml2).not.toMatch(/<[A-Za-z0-9]+>-?\d+[.,]\d/);
    expect(eskdValue(xml2, "MomsBetala")).toBe("-30000"); // [SKV-FIL] Exempel 5
  });

  test("Skatteverkets Exempel 1 återskapas rad för rad", () => {
    // [SKV-FIL] Exempel 1: försäljning 25 % med avdrag för ingående moms.
    const { boxes } = computeVatBoxes([
      row(3001, "SALES_25", 0, 100_000),
      row(2611, "OUTPUT_VAT_25", 0, 25_000),
      row(2640, "INPUT_VAT", 5_000, 0),
    ]);
    const xml2 = generateEskd(ORG, "2024-01-31", boxes);
    expect(eskdTags(xml2)).toEqual([
      "Period", "ForsMomsEjAnnan", "MomsUtgHog", "MomsIngAvdr", "MomsBetala",
    ]);
  });
});

// ===========================================================================
// B. Organisationsnumret  [SKV-FIL Rad 3]
// ===========================================================================

describe("organisationsnumret i eSKD-filen får inte tillverkas", () => {
  // Numret ska anges "med 10 siffror enligt formatet xxxxxx-xxxx" [SKV-FIL].
  // En tyst slice(-10) av något längre gör ett välformat men FEL nummer, och
  // filen lämnas då in under en annan juridisk person.
  test("ett VAT-nummer ger null, inte ett påhittat organisationsnummer", () => {
    expect(formatEskdOrgNr("SE556677889901")).toBeNull();
  });

  test("ett elvasiffrigt inmatningsfel ger null", () => {
    expect(formatEskdOrgNr("556677-88991")).toBeNull();
  });

  test("formatEskdOrgNr och orgNumberIssue är alltid överens", () => {
    // Inställningarnas kontroll och filens formatering får aldrig vara oense:
    // annars sparas ett nummer som sedan spränger momsgodkännandet.
    const inputs = [
      "5566778899", "556677-8899", " 556677 8899 ", "199003151234",
      "165566778899", "SE556677889901", "556677-88991", "12345", "",
      "205566778899", "185566778899",
    ];
    for (const raw of inputs) {
      const accepted = formatEskdOrgNr(raw) !== null;
      const rejected = orgNumberIssue(raw) !== null || raw.trim() === "";
      expect([raw, accepted]).toEqual([raw, !rejected]);
    }
  });

  test("giltiga nummer formateras fortfarande", () => {
    expect(formatEskdOrgNr("5566778899")).toBe("556677-8899");
    expect(formatEskdOrgNr("556677-8899")).toBe("556677-8899");
    expect(formatEskdOrgNr("199003151234")).toBe("900315-1234");
    expect(formatEskdOrgNr("165566778899")).toBe("556677-8899");
  });

  test("generateEskd vägrar skriva filen när numret inte duger", () => {
    expect(() => generateEskd("SE556677889901", "2026-03-31", { "49": 0 })).toThrow(/xxxxxx-xxxx/);
  });
});

// ===========================================================================
// C. Upplysningen, Rad 35  [SKV-FIL "Upplysningar"]
// ===========================================================================

describe("upplysningen (eSKD Rad 35) och ISO-8859-1", () => {
  // Filen är ISO-8859-1 (Rad 1) och Skatteverket avvisar "otillåtna tecken"
  // [SKV-FIL, Avvisande fel]. Positionerna 128–159 är OTILLDELADE
  // C1-kontrollpositioner i ISO/IEC 8859-1 — inga tryckbara tecken. Invarianten
  // är att INGEN kodpunkt i det blocket kan nå filen: U+0085 (NEL) är en
  // radbrytning och normaliseras till ett mellanslag som varje annan
  // radbrytning, resten avvisas med ett svenskt fel.
  test("ingen C1-kodpunkt kan nå den skrivna filen", () => {
    for (let code = 0x80; code <= 0x9f; code++) {
      const note = `Rattelse${String.fromCodePoint(code)}av perioden`;
      const issue = validateEskdNote(note);
      if (issue === null) {
        const xml = generateEskd("5566778899", "2026-03-31", { "49": 0 }, note);
        const worst = Math.max(...[...xml].map((c) => c.codePointAt(0)!));
        expect([code, worst < 0x80 || worst > 0x9f]).toEqual([code, true]);
      } else {
        expect([code, issue.includes("ISO-8859-1")]).toEqual([code, true]);
        expect([code, /U\+00[89][0-9A-F]/.test(issue)]).toEqual([code, true]);
      }
    }
  });

  test("U+0085 behandlas som radbrytning, inte som text", () => {
    expect(normalizeEskdNote(`Rattelse${String.fromCodePoint(0x85)}av perioden`))
      .toBe("Rattelse av perioden");
  });

  test("övriga C1-tecken avvisas med kodpunkten i felet", () => {
    const issue = validateEskdNote(`Rattelse${String.fromCodePoint(0x9f)}av perioden`);
    expect(issue).toContain("U+009F");
  });

  test("generateEskd vägrar skriva filen med ett C1-tecken", () => {
    expect(() => generateEskd("5566778899", "2026-03-31", { "49": 0 },
      `Rattelse${String.fromCodePoint(0x9f)}av perioden`)).toThrow(/ISO-8859-1/);
  });

  test("tecken som FINNS i ISO-8859-1 släpps igenom", () => {
    // U+00AD mjukt bindestreck ligger i teckenuppsättningen och ska passera.
    expect(validateEskdNote(`Rattelse${String.fromCodePoint(0xad)}av perioden`)).toBeNull();
    expect(validateEskdNote("Rättelse av perioden - se bilaga")).toBeNull();
  });

  test("tankstreck och emoji avvisas", () => {
    expect(validateEskdNote("Rattelse – se bilaga")).toContain("ISO-8859-1");
    expect(validateEskdNote("Klart 🎉")).toContain("ISO-8859-1");
  });

  test("över 300 tecken är ett fel, inte en avkortning", () => {
    // En upplysning till Skatteverket som klipps av mitt i en mening är värre
    // än en fråga till användaren.
    const lang = "a".repeat(301);
    expect(validateEskdNote(lang)).toMatch(/högst 300 tecken/);
    expect(validateEskdNote("a".repeat(300))).toBeNull();
  });

  test("upplysningen skrivs sist inuti <Moms>, XML-escapad", () => {
    const xml = generateEskd(ORG, "2026-03-31", boxesFor({ "10": 25_000, "49": 25_000 }),
      "Rattelse av perioden <se bilaga> & tidigare fil");
    expect(eskdTags(xml)).toEqual(["Period", "MomsUtgHog", "MomsBetala", "TextUpplysningMoms"]);
    expect(eskdValue(xml, "TextUpplysningMoms"))
      .toBe("Rattelse av perioden &lt;se bilaga&gt; &amp; tidigare fil");
  });

  test("utan upplysning skrivs ingen tom tagg", () => {
    for (const note of [undefined, null, "", "   ", "\n\t "]) {
      const xml = generateEskd(ORG, "2026-03-31", boxesFor({ "49": 0 }), note);
      expect(eskdTags(xml)).toEqual(["Period", "MomsBetala"]);
    }
  });

  test("radbrytningar pressas ihop till en rad — inget går förlorat", () => {
    const xml = generateEskd(ORG, "2026-03-31", boxesFor({ "49": 0 }),
      "Rad ett\nRad tva\r\n\tRad tre");
    expect(eskdValue(xml, "TextUpplysningMoms")).toBe("Rad ett Rad tva Rad tre");
  });
});

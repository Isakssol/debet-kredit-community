/**
 * GOLDEN: momsrapportens summering och rimlighetskontroller.
 *
 * Testerna kodar MYNDIGHETENS förväntade värden, inte kodens nuvarande
 * beteende. Ett rött test är ett fynd i produkten, inte i testet.
 *
 * PRIMÄRKÄLLOR
 *
 * [SKV-FYLL]  Skatteverket, "Fylla i momsdeklarationen", avsnitt
 *             "G – Moms att betala eller få tillbaka", fält 49:
 *             "Beloppet är summan av fälten 10, 11, 12, 30, 31, 32, 60, 61
 *             och 62 minus beloppet i fält 48. Fält 49 ska du alltid fylla i."
 *             Samt fält 48 (ingen teckenbegränsning) och fält 50 samt 60–62
 *             (beskattningsunderlag vid import).
 *             https://www.skatteverket.se/foretag/moms/deklareramoms/fyllaimomsdeklarationen.4.3a2a542410ab40a421c80004214.html
 * [SKV-FIL]   Skatteverket, "Lämna momsdeklaration via fil i e-tjänsten" —
 *             belopp i heltal utan decimaler, inledande minustecken tillåtet.
 * [SFF]       Skatteförfarandeförordning (2011:1261) 22 kap. 1 §: "Belopp som
 *             avser skatt eller avgift enligt skatteförfarandelagen (2011:1244)
 *             ska anges i hela krontal så att öretal faller bort."
 * [ML]        Mervärdesskattelag (2023:200) 16 kap. (omvänd betalningsskyldighet
 *             vid unionsinternt förvärv) och 9 kap. (skattesatserna).
 * [ÅRL 2:4]   Årsredovisningslag (1995:1554) 2 kap. 4 § 1 st p. 7 —
 *             balanskontinuitet: den ingående balansen är föregående års
 *             utgående, inte årets affärshändelser.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  computeVatBoxes, computeVatChecks, NON_VAT_TRANSFER_SOURCES, type VatEntry,
} from "@/lib/vat/report";

// ---------------------------------------------------------------------------
// Testhjälp
// ---------------------------------------------------------------------------

const row = (account: number, vatCode: string | null, debit: number, credit: number): VatEntry =>
  ({ account, vat_code: vatCode, debit, credit });

/** Ruta 49 enligt [SKV-FYLL] — räknad ur de redovisade (hela) rutbeloppen. */
const ruta49 = (b: Record<string, number>): number =>
  ["10", "11", "12", "30", "31", "32", "60", "61", "62"]
    .reduce((s, k) => s + (b[k] ?? 0), 0) - (b["48"] ?? 0);

const check = (entries: VatEntry[], label: string) =>
  computeVatChecks(entries).find((c) => c.label.includes(label));

/** Korrekt bokfört EU-förvärv: underlag på 45xx, omvänd moms på 2614, avdrag på 2645. */
const euPurchase = (base: number): VatEntry[] => [
  row(4515, "PURCHASE_EU_GOODS", base, 0),
  row(2614, null, 0, base * 0.25),
  row(2645, null, base * 0.25, 0),
];

/** Samma inköp men bokfört direkt på ett inventariekonto — underlaget saknas. */
const euPurchaseWithoutBase = (base: number): VatEntry[] => [
  row(1220, null, base, 0),
  row(2614, null, 0, base * 0.25),
  row(2645, null, base * 0.25, 0),
];

// ===========================================================================
// A. Ruta 49 — exakt formel  [SKV-FYLL fält 49]
// ===========================================================================

describe("A. Ruta 49 = 10+11+12+30+31+32+60+61+62 − 48 [SKV-FYLL fält 49]", () => {
  test("A1: normalfall — försäljning 25 % med avdragsgill ingående moms", () => {
    const { boxes } = computeVatBoxes([
      row(3001, "SALES_25", 0, 100_000),
      row(2611, null, 0, 25_000),
      row(2640, null, 5_000, 0),
    ]);
    expect(boxes["05"]).toBe(100_000);
    expect(boxes["10"]).toBe(25_000);
    expect(boxes["48"]).toBe(5_000);
    expect(boxes["49"]).toBe(20_000);
    expect(boxes["49"]).toBe(ruta49(boxes));
  });

  test("A2: ruta 49 räknas ur de REDAN trunkerade rutorna [SKV-FIL, SFF 22:1]", () => {
    // Öretalen stryks per ruta, och ruta 49 summeras därefter — annars stämmer
    // inte Skatteverkets egen formel i den inlämnade filen.
    const { boxes } = computeVatBoxes([
      row(3001, "SALES_25", 0, 100_000.99),
      row(2611, null, 0, 25_000.75),
      row(2640, null, 5_000.99, 0),
    ]);
    expect(boxes["10"]).toBe(25_000);
    expect(boxes["48"]).toBe(5_000);
    expect(boxes["49"]).toBe(ruta49(boxes));
  });

  test("A3: öretalen stryks mot noll även för negativa rutor", () => {
    // Math.round hade avrundat −25 000,75 till −25 001 och därmed redovisat mer
    // utgående moms än som bokförts.
    const { boxes } = computeVatBoxes([
      row(3001, "SALES_25", 100_000.99, 0),
      row(2611, null, 25_000.75, 0),
    ]);
    expect(boxes["10"]).toBe(-25_000);
    expect(boxes["05"]).toBe(-100_000);
    expect(boxes["49"]).toBe(ruta49(boxes));
  });

  test("A4: ett kreditsaldo på 2650-sidan ger en negativ ruta 49 [SKV-FIL]", () => {
    const { boxes } = computeVatBoxes([row(2640, null, 30_000, 0)]);
    expect(boxes["48"]).toBe(30_000);
    expect(boxes["49"]).toBe(-30_000);
  });
});

// ===========================================================================
// B. Underlaget härleds inte  [ML 16 kap., SKV-FYLL fält 20–24 och 30–32]
// ===========================================================================

describe("B. Ruta 20 fylls bara av det som ÄR bokfört", () => {
  test("B1: korrekt bokfört EU-förvärv ger underlag i ruta 20 och moms i ruta 30", () => {
    const { boxes } = computeVatBoxes(euPurchase(10_000));
    expect(boxes["20"]).toBe(10_000);
    expect(boxes["30"]).toBe(2_500);
    expect(boxes["48"]).toBe(2_500);
  });

  test("B2: moms utan underlag lämnar ruta 20 tom i stället för att gissa 25 %", () => {
    // Ett härlett belopp ser rätt ut i filen men saknar motsvarighet i
    // huvudboken, blir alltid 25 % även när omvändningen gäller 12 eller 6
    // procent, och döljer den felkontering det kompenserar för.
    const { boxes } = computeVatBoxes(euPurchaseWithoutBase(10_000));
    expect(boxes["30"]).toBe(2_500);
    expect(boxes["20"] ?? 0).toBe(0);
    expect(boxes["21"] ?? 0).toBe(0);
  });

  test("B3: ruta 49 påverkas inte av att underlaget saknas", () => {
    const { boxes } = computeVatBoxes(euPurchaseWithoutBase(10_000));
    expect(boxes["49"]).toBe(0); // 2 500 utgående − 2 500 ingående
  });
});

// ===========================================================================
// C. Rimlighetskontrollerna säger var felet sitter
// ===========================================================================

describe("C. Rimlighetskontrollerna", () => {
  test("C1: korrekt bokfört EU-förvärv ger grön kontroll", () => {
    expect(check(euPurchase(10_000), "omvänd skattskyldighet")?.ok).toBe(true);
  });

  test("C2: saknat underlag ger varning med belopp och åtgärd", () => {
    const c = check(euPurchaseWithoutBase(10_000), "omvänd skattskyldighet");
    expect(c?.ok).toBe(false);
    expect(c?.detail).toContain("Underlag saknas för utgående moms");
    expect(c?.detail).toContain("kontrollera konteringen");
    // sv-SE använder hårt mellanslag i tusentalen
    expect(c?.detail.replace(/ /g, " ")).toContain("10 000 kr för lite");
  });

  test("C3: ingen omvänd moms alls ger ingen kontroll", () => {
    expect(check([
      row(3001, "SALES_25", 0, 10_000),
      row(2611, null, 0, 2_500),
    ], "omvänd skattskyldighet")).toBeUndefined();
  });

  test("C4: utgående moms kontrolleras mot sitt eget underlag per sats", () => {
    const c = check([
      row(3001, "SALES_25", 0, 100_000),
      row(2611, null, 0, 20_000), // för lite moms
    ], "Utgående moms 25 %");
    expect(c?.ok).toBe(false);
    expect(c?.detail).toContain("kontrollera konteringen");
  });

  test("C5: en negativ ruta 48 är en UPPLYSNING, inte ett fel [SKV-FYLL fält 48]", () => {
    // En period där kreditnotor på inköp överstiger periodens inköp ger ett
    // fullt legitimt kreditsaldo på 2641. Ruta 48 har inget teckenkrav, och
    // eSKD-formatet tillåter inledande minustecken. Ett rött fel ska vara
    // reserverat för något som faktiskt är fel — annars lär sig användaren att
    // "rätta" en korrekt bokföring.
    const c = check([row(2641, null, 0, 3_000)], "Ingående moms är negativ");
    expect(c).toBeDefined();
    expect(c?.ok).toBe(true);
    expect(c?.detail).toContain("normalt");
  });

  test("C6: importmomsen i ruta 60–62 kontrolleras mot underlaget i ruta 50", () => {
    // Varuimport bokförd rakt på ett tillgångs- eller kostnadskonto ger moms i
    // ruta 60–62 utan beskattningsunderlag i ruta 50, och deklarationen gick
    // förut ut utan ett ord. [SKV-FYLL fält 50 och 60–62]
    const utan = check([row(2615, null, 0, 2_500)], "importmomsen");
    expect(utan?.ok).toBe(false);
    expect(utan?.detail).toContain("Ruta 50");

    const med = check([
      row(4545, "PURCHASE_IMPORT", 10_000, 0),
      row(2615, null, 0, 2_500),
      row(2645, null, 2_500, 0),
    ], "importmomsen");
    expect(med?.ok).toBe(true);
  });

  test("C7: tullräkningen når ruta 50 och ruta 60 i deklarationen", () => {
    const { boxes } = computeVatBoxes([
      row(4545, "PURCHASE_IMPORT", 10_000, 0),
      row(2615, null, 0, 2_500),
      row(2645, null, 2_500, 0),
    ]);
    expect(boxes["50"]).toBe(10_000);
    expect(boxes["60"]).toBe(2_500);
    expect(boxes["48"]).toBe(2_500);
    expect(boxes["49"]).toBe(ruta49(boxes));
  });

  test("C8: utan import alls finns ingen importkontroll", () => {
    expect(check([
      row(3001, "SALES_25", 0, 10_000),
      row(2611, null, 0, 2_500),
    ], "importmomsen")).toBeUndefined();
  });
});

// ===========================================================================
// D. Källor som aldrig redovisar moms  [ÅRL 2:4]
// ===========================================================================

describe("D. Momsomföring, ingående balans och bokslut hör inte till perioden", () => {
  test("D1: listan finns på ETT ställe och innehåller alla tre källorna", () => {
    // Bokslutsverifikatet är daterat räkenskapsårets sista dag och ligger därför
    // ALLTID i den sista momsperioden; rör det ett 26xx-konto hamnade beloppet i
    // deklarationen trots att posten inte är en momspliktig omsättning.
    // Momsomföringen nollställer 26xx mot 2650 och skulle annars räknas in i sin
    // egen period. Ingående balanser är föregående års utgående [ÅRL 2:4].
    expect(NON_VAT_TRANSFER_SOURCES).toEqual(
      expect.arrayContaining(["vat_report", "opening_balance", "year_end"]));
  });

  test("D2: momsunderlaget hämtas med listan, inte med en egen kopia", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../actions/vat.ts", import.meta.url)), "utf8");
    expect(src).toContain("NON_VAT_TRANSFER_SOURCES");
    expect(src).toMatch(/\.in\("source", NON_VAT_TRANSFER_SOURCES\)/);
    // Ingen dubblerad literal-lista i actionen
    expect(src).not.toMatch(/\[\s*"vat_report"\s*,\s*"opening_balance"/);
  });
});

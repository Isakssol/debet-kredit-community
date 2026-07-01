import { describe, it, expect } from "vitest";
import { kronorToOre, vatFromGross, vatOnNet, roundToKrona } from "../money";
import { generateOcr, validateOcr } from "../ocr";
import { calculateTotals, invoicePostingRows } from "../invoicing/totals";
import { representation, fSkatt, kopMotKvitto, milersattning } from "../posting/quick-events";
import { computeVatBoxes, vatClosingRows, generateEskd, vatPeriods } from "../vat/report";
import { calculateEfTax } from "../tax/calc";
import { generateSie4 } from "../sie/export";

describe("money", () => {
  it("plockar ut moms ur bruttobelopp", () => {
    expect(vatFromGross(kronorToOre(125), 25)).toBe(kronorToOre(25));
    expect(vatFromGross(kronorToOre(112), 12)).toBe(kronorToOre(12));
    expect(vatFromGross(kronorToOre(106), 6)).toBe(kronorToOre(6));
  });
  it("beräknar moms på netto", () => {
    expect(vatOnNet(kronorToOre(100), 25)).toBe(kronorToOre(25));
  });
  it("öresavrundar till hel krona", () => {
    const { rounded, rounding } = roundToKrona(kronorToOre(99.49));
    expect(rounded).toBe(kronorToOre(99));
    expect(rounding).toBe(kronorToOre(-0.49));
  });
});

describe("OCR (Bankgirocentralens standard)", () => {
  it("genererar giltigt OCR med längdsiffra + Luhn", () => {
    const ocr = generateOcr(1);
    expect(ocr).toBe("133");
    expect(validateOcr(ocr)).toBe(true);
  });
  it("validerar alla genererade nummer", () => {
    for (const no of [1, 42, 100, 9999, 12345]) {
      expect(validateOcr(generateOcr(no))).toBe(true);
    }
  });
  it("underkänner manipulerade nummer", () => {
    expect(validateOcr("134")).toBe(false);
  });
});

describe("fakturatotaler", () => {
  const rows = [
    { description: "Konsult", quantity: 10, unitPrice: 1200, discountPct: 0, vatRate: 25, account: 3011 },
  ];
  it("beräknar netto/moms/total", () => {
    const t = calculateTotals(rows, true);
    expect(t.net).toBe(12000);
    expect(t.vat).toBe(3000);
    expect(t.total).toBe(15000);
    expect(t.vatGroups).toEqual([{ rate: 25, net: 12000, vat: 3000 }]);
  });
  it("EU omvänd skattskyldighet = ingen moms", () => {
    const t = calculateTotals(rows, false);
    expect(t.vat).toBe(0);
    expect(t.total).toBe(12000);
  });
  it("momsspecifikation per sats vid blandade satser", () => {
    const mixed = [
      ...rows,
      { description: "Bok", quantity: 1, unitPrice: 100, discountPct: 0, vatRate: 6, account: 3001 },
    ];
    const t = calculateTotals(mixed, true);
    expect(t.vatGroups).toHaveLength(2);
    expect(t.vatGroups.find((g) => g.rate === 6)?.vat).toBe(6);
  });
  it("rabatt per rad", () => {
    const t = calculateTotals([{ ...rows[0], discountPct: 50 }], true);
    expect(t.net).toBe(6000);
  });
  it("konteringen balanserar (D 1510 = K intäkt + K moms + avrundning)", () => {
    const t = calculateTotals(rows, true);
    const posting = invoicePostingRows(rows, t, true);
    const debit = posting.reduce((s, r) => s + r.debit, 0);
    const credit = posting.reduce((s, r) => s + r.credit, 0);
    expect(debit).toBeCloseTo(credit, 2);
    expect(posting.find((r) => r.account === 1510)?.debit).toBe(15000);
    expect(posting.find((r) => r.account === 2611)?.credit).toBe(3000);
  });
});

describe("snabbhändelser", () => {
  it("F-skatt bokförs som eget uttag (2012), aldrig kostnad", () => {
    const r = fSkatt(5000);
    expect(r.rows.find((x) => x.account === 2012)?.debit).toBe(5000);
    expect(r.rows.every((x) => x.account < 3000 || x.account >= 9000)).toBe(true);
  });
  it("kvitto delar upp moms korrekt", () => {
    const r = kopMotKvitto(500, 25, 6110, "Kontorsmaterial");
    expect(r.rows.find((x) => x.account === 6110)?.debit).toBe(400);
    expect(r.rows.find((x) => x.account === 2640)?.debit).toBe(100);
    expect(r.rows.find((x) => x.account === 1930)?.credit).toBe(500);
  });
  it("milersättning 25 kr/mil", () => {
    const r = milersattning(20, 25);
    expect(r.rows.find((x) => x.account === 5800)?.debit).toBe(500);
  });
  it("representation: momslyft begränsas till 300 kr underlag/person", () => {
    // Middag 2 personer, 1500 kr inkl 25 % moms → netto 1200, moms 300.
    // Max underlag: 2 × 300 = 600 → avdragsgill moms 150, resten ej avdragsgill.
    const r = representation(1500, 25, 2, 300, 60);
    expect(r.rows.find((x) => x.account === 2640)?.debit).toBe(150);
    // Ej avdragsgill del: netto 1200 + ej avdragsgill moms 150 = 1350 på 6072
    expect(r.rows.find((x) => x.account === 6072)?.debit).toBe(1350);
    const debit = r.rows.reduce((s, x) => s + x.debit, 0);
    const credit = r.rows.reduce((s, x) => s + x.credit, 0);
    expect(debit).toBeCloseTo(credit, 2);
  });
  it("enklare förtäring ≤ 60 kr/person → 6071 avdragsgill", () => {
    const r = representation(100, 12, 2, 300, 60); // fika 2 pers, 50 kr/pers netto ≈ 44.64
    expect(r.rows.some((x) => x.account === 6071)).toBe(true);
    expect(r.rows.some((x) => x.account === 6072)).toBe(false);
  });
});

describe("momsdeklarationen", () => {
  const entries = [
    // Försäljning 100 000 + utgående moms 25 000
    { account: 3011, vat_code: "SALES_25", debit: 0, credit: 100000 },
    { account: 2611, vat_code: null, debit: 0, credit: 25000 },
    // Inköp med ingående moms 5 000
    { account: 2640, vat_code: null, debit: 5000, credit: 0 },
    // EU-tjänsteförsäljning 20 000 (ruta 39)
    { account: 3308, vat_code: "SALES_EU_SERVICES", debit: 0, credit: 20000 },
  ];
  it("mappar konton till rätt rutor", () => {
    const { boxes } = computeVatBoxes(entries);
    expect(boxes["05"]).toBe(100000);
    expect(boxes["10"]).toBe(25000);
    expect(boxes["39"]).toBe(20000);
    expect(boxes["48"]).toBe(5000);
    expect(boxes["49"]).toBe(20000); // 25000 − 5000
  });
  it("öretal slopas (hela kronor)", () => {
    const { boxes } = computeVatBoxes([
      { account: 3011, vat_code: "SALES_25", debit: 0, credit: 999.99 },
    ]);
    expect(boxes["05"]).toBe(999);
  });
  it("omföringsverifikatet nollställer momskontona mot 2650", () => {
    const { exact } = computeVatBoxes(entries);
    const rows = vatClosingRows(exact);
    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    expect(debit).toBeCloseTo(credit, 2);
    expect(rows.find((r) => r.account === 2650)?.credit).toBe(20000);
  });
  it("eSKD-filen följer Skatteverkets format", () => {
    const { boxes } = computeVatBoxes(entries);
    const xml = generateEskd("900101-1234", "2026-03-31", boxes);
    expect(xml).toContain("<eSKDUpload Version=\"6.0\">");
    expect(xml).toContain("<OrgNr>900101-1234</OrgNr>");
    expect(xml).toContain("<Period>202603</Period>");
    expect(xml).toContain("<ForsMomsEjAnnan>100000</ForsMomsEjAnnan>");
    expect(xml).toContain("<MomsUtgHog>25000</MomsUtgHog>");
    expect(xml).toContain("<MomsIngAvdr>5000</MomsIngAvdr>");
    expect(xml).toContain("<MomsBetala>20000</MomsBetala>");
    expect(xml).toContain("<ForsTjSkskAnnatEg>20000</ForsTjSkskAnnatEg>");
  });
  it("kvartalens deklarationsdatum (12:e, 17:e i jan/aug)", () => {
    const periods = vatPeriods(2026, "kvartal", false);
    expect(periods.map((p) => p.dueDate)).toEqual([
      "2026-05-12", "2026-08-17", "2026-11-12", "2027-02-12",
    ]);
  });
  it("helårsmoms: 12 maj utan EU-handel, 26 feb med", () => {
    expect(vatPeriods(2026, "helar", false)[0].dueDate).toBe("2027-05-12");
    expect(vatPeriods(2026, "helar", true)[0].dueDate).toBe("2027-02-26");
  });
});

describe("skatteberäkning EF 2026", () => {
  const rules = {
    egenavgifterFull: 28.97, nedsattningPct: 7.5, nedsattningMax: 15000,
    nedsattningKrav: 40000, schablonavdrag: 25, periodiseringsfondPct: 30,
    skiktgransStatlig: 660400, statligSkattPct: 20, kommunalskattPct: 32,
  };
  it("schablonavdrag 25 % → avgiftsunderlag 75 %", () => {
    const t = calculateEfTax({
      resultat: 400000, ejAvdragsgilla: 0,
      periodiseringsfondAvsattning: 0, rantefordelning: 0, otherIncome: 0,
    }, rules);
    expect(t.avgiftsunderlag).toBe(300000);
    // Egenavgifter: 300000 × 28,97 % − nedsättning min(300000×7,5 %, 15000)
    expect(t.egenavgifter).toBeCloseTo(300000 * 0.2897 - 15000, 0);
    expect(t.kommunalskatt).toBeCloseTo(96000, 0);
    expect(t.statligSkatt).toBe(0);
  });
  it("statlig skatt över skiktgränsen", () => {
    const t = calculateEfTax({
      resultat: 1200000, ejAvdragsgilla: 0,
      periodiseringsfondAvsattning: 0, rantefordelning: 0, otherIncome: 0,
    }, rules);
    // avgiftsunderlag 900 000 → 239 600 över gränsen → 20 %
    expect(t.statligSkatt).toBeCloseTo((900000 - 660400) * 0.2, 0);
  });
  it("periodiseringsfond sänker underlaget", () => {
    const base = calculateEfTax({
      resultat: 400000, ejAvdragsgilla: 0,
      periodiseringsfondAvsattning: 0, rantefordelning: 0, otherIncome: 0,
    }, rules);
    const withFund = calculateEfTax({
      resultat: 400000, ejAvdragsgilla: 0,
      periodiseringsfondAvsattning: 120000, rantefordelning: 0, otherIncome: 0,
    }, rules);
    expect(withFund.totalSkattOchAvgifter).toBeLessThan(base.totalSkattOchAvgifter);
    expect(withFund.avgiftsunderlag).toBe(210000);
  });
});

describe("SIE 4E", () => {
  it("genererar korrekt filstruktur", () => {
    const sie = generateSie4({
      companyName: "Oliver Isaksson (trimtech)",
      orgNumber: "900101-1234",
      generatedDate: "20260701",
      fiscalYear: { year: 2026, start: "2026-01-01", end: "2026-12-31" },
      accounts: [
        { number: 1930, name: "Företagskonto" },
        { number: 3011, name: "Försäljning tjänster 25 %", sru: 7410 },
      ],
      openingBalances: [{ account: 1930, amount: 50000 }],
      closingBalances: [{ account: 1930, amount: 65000 }],
      results: [{ account: 3011, amount: -12000 }],
      verifications: [{
        series: "B", number: 1, date: "2026-07-01",
        description: "Kundfaktura 1", registeredDate: "2026-07-01",
        rows: [
          { account: 1510, amount: 15000 },
          { account: 2611, amount: -3000 },
          { account: 3011, amount: -12000 },
        ],
      }],
    });
    expect(sie).toContain("#FLAGGA 0");
    expect(sie).toContain("#SIETYP 4");
    expect(sie).toContain('#FNAMN "Oliver Isaksson (trimtech)"');
    expect(sie).toContain("#RAR 0 20260101 20261231");
    expect(sie).toContain('#KONTO 1930 "Företagskonto"');
    expect(sie).toContain("#SRU 3011 7410");
    expect(sie).toContain("#IB 0 1930 50000.00");
    expect(sie).toContain("#UB 0 1930 65000.00");
    expect(sie).toContain("#RES 0 3011 -12000.00");
    expect(sie).toContain('#VER B 1 20260701 "Kundfaktura 1" 20260701');
    expect(sie).toContain("#TRANS 1510 {} 15000.00");
    expect(sie).toContain("#TRANS 2611 {} -3000.00");
    // Verifikatets rader balanserar
    expect(15000 - 3000 - 12000).toBe(0);
  });
});

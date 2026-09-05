/**
 * GOLDEN: kundfakturans totaler, kontering och kreditering.
 *
 * Testerna kodar LAGENS förväntade värden, inte kodens nuvarande beteende.
 * Ett rött test är ett fynd i produkten, inte i testet.
 *
 * PRIMÄRKÄLLOR
 *
 * [ML]    Mervärdesskattelag (2023:200)
 *         - 9 kap. — skattesatserna: 25 %, 12 % och 6 %. Andra satser finns
 *           inte i svensk mervärdesskatt.
 *         - 17 kap. 24 § — beskattningsunderlag per skattesats, skattesatsen
 *           och momsbeloppet ska framgå av fakturan.
 *         - 17 kap. 22 § och 28 § 5 — ändringsfakturan avser ursprungsfakturan;
 *           det belopp som krediteras ska motsvara det som fakturerats.
 *         - 7 kap. — ändringsfakturan minskar tidigare redovisad utgående skatt.
 *           Skatteverket, rättslig vägledning, "Redovisning av kreditnota".
 * [BFL]   Bokföringslag (1999:1078) 4 kap. 2 § — den sidoordnade bokföringen
 *         (kundreskontran) ska kunna stämmas av mot balanskontot; 5 kap. 2 §.
 * [INK]   Lag (1981:739) om ersättning för inkassokostnader m.m.
 *         - 2 §: ersättning för skriftlig betalningspåminnelse utgår bara om
 *           avtal om detta träffats senast i samband med skuldens uppkomst.
 *         - 4 § 1 st: bara kostnader som varit skäligen påkallade.
 *         - 4 § 2 st: 60 kronor för en skriftlig betalningspåminnelse.
 *         https://lagen.nu/1981:739
 * [SKV]   Skatteverket, "Fylla i momsdeklarationen", fält 05 och 10–12.
 */
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { calculateTotals, invoicePostingRows, type InvoiceRowInput } from "@/lib/invoicing/totals";
import { pickRuleValue } from "@/lib/rule-values";

// ---------------------------------------------------------------------------
// Testhjälp
// ---------------------------------------------------------------------------

type Row = InvoiceRowInput;

const row = (p: Partial<Row> & Pick<Row, "quantity" | "unitPrice" | "vatRate">): Row => ({
  description: p.description ?? "Rad",
  quantity: p.quantity,
  unitPrice: p.unitPrice,
  discountPct: p.discountPct ?? 0,
  vatRate: p.vatRate,
  account: p.account ?? 3011,
  isTextRow: p.isTextRow ?? false,
});

/**
 * Så speglar krediteringen originalets rader: negerad kvantitet, samma pris,
 * samma momssats. PDF-rutten räknar om totalerna ur exakt dessa rader, så en
 * omräkning måste ge exakt de negerade talen tillbaka.
 */
const mirrorRows = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, quantity: -r.quantity }));

/** Summan av debet respektive kredit i en kontering — måste vara lika [BFL 4 kap.] */
const sums = (rows: { debit: number; credit: number }[]) => ({
  debit: Math.round(rows.reduce((s, r) => s + r.debit, 0) * 100) / 100,
  credit: Math.round(rows.reduce((s, r) => s + r.credit, 0) * 100) / 100,
});

const acc = (rows: { account: number; debit: number; credit: number }[], n: number) =>
  rows.filter((r) => r.account === n);

const MIG_DIR = fileURLToPath(new URL("../../../../supabase/migrations/", import.meta.url));
const SQL_ALL = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => readFileSync(path.join(MIG_DIR, f), "utf8")).join("\n");

// ===========================================================================
// A. Kundfaktura: momsspecifikation per skattesats och kontering [ML 17:24]
// ===========================================================================

describe("A. Kundfaktura — momsspecifikation per skattesats [ML 17 kap. 24 §]", () => {
  const blandat: Row[] = [
    row({ quantity: 2, unitPrice: 1000, vatRate: 25, account: 3011 }),
    row({ quantity: 1, unitPrice: 450, vatRate: 12, account: 3012 }),
    row({ quantity: 3, unitPrice: 99.5, vatRate: 6, account: 3013 }),
  ];

  test("A1: beskattningsunderlag och moms redovisas per sats, aldrig hopslaget", () => {
    const t = calculateTotals(blandat, true);
    expect(t.vatGroups).toEqual([
      { rate: 25, net: 2000, vat: 500 },
      { rate: 12, net: 450, vat: 54 },
      { rate: 6, net: 298.5, vat: 17.91 },
    ]);
    expect(t.net).toBe(2748.5);
    expect(t.vat).toBe(571.91);
  });

  test("A2: öresavrundning till hel krona bokförs på 3740 och totalen blir hel krona", () => {
    const t = calculateTotals(blandat, true);
    // 2748,50 + 571,91 = 3320,41 → 3320,00 att betala, −0,41 i öresutjämning
    expect(t.total).toBe(3320);
    expect(t.rounding).toBe(-0.41);
    expect(Number.isInteger(t.total)).toBe(true);
  });

  test("A3: konteringen balanserar och lägger utgående moms per sats på 2611/2621/2631", () => {
    const t = calculateTotals(blandat, true);
    const p = invoicePostingRows(blandat, t, true);
    expect(sums(p).debit).toBe(sums(p).credit);
    expect(acc(p, 1510)[0].debit).toBe(3320);
    expect(acc(p, 2611)[0].credit).toBe(500);
    expect(acc(p, 2621)[0].credit).toBe(54);
    expect(acc(p, 2631)[0].credit).toBe(17.91);
    expect(acc(p, 3011)[0].credit).toBe(2000);
    expect(acc(p, 3012)[0].credit).toBe(450);
    expect(acc(p, 3013)[0].credit).toBe(298.5);
    // Negativ öresutjämning = kostnad → debet 3740
    expect(acc(p, 3740)[0].debit).toBe(0.41);
  });

  test("A4: rabatt räknas av på underlaget innan momsen beräknas", () => {
    const t = calculateTotals([row({ quantity: 1, unitPrice: 1000, discountPct: 25, vatRate: 25 })], true);
    expect(t.net).toBe(750);
    expect(t.vat).toBe(187.5);
  });

  test("A5: textrader påverkar varken underlag eller moms", () => {
    const t = calculateTotals(
      [row({ quantity: 1, unitPrice: 100, vatRate: 25 }), row({ quantity: 0, unitPrice: 0, vatRate: 25, isTextRow: true })],
      true
    );
    expect(t.net).toBe(100);
    expect(t.vat).toBe(25);
  });

  test("A6: momsfri kund (omvänd/export) — ingen utgående moms, ett underlag med 0 %", () => {
    const t = calculateTotals(blandat, false);
    expect(t.vat).toBe(0);
    expect(t.vatGroups).toEqual([{ rate: 0, net: 2748.5, vat: 0 }]);
    expect(invoicePostingRows(blandat, t, false).some((p) => p.account >= 2600 && p.account < 2700)).toBe(false);
  });
});

// ===========================================================================
// B. Negativa satsgrupper får aldrig tappas [ML 17:24, SKV fält 05/10–12]
// ===========================================================================

describe("B. En negativ satsgrupp bokförs — den försvinner inte", () => {
  // 1 000 kr till 6 % plus ett prisavdrag på −100 kr som avser en tjänst med
  // 25 %. Satsgruppen för 25 % blir negativ. Släpps dess moms blir verifikatet
  // obalanserat och både ruta 05 och ruta 10 fel.
  const medAvdrag: Row[] = [
    row({ quantity: 1, unitPrice: 1000, vatRate: 6, account: 3013 }),
    row({ quantity: 1, unitPrice: -100, vatRate: 25, account: 3011 }),
  ];

  test("B1: den negativa satsgruppens moms räknas fram", () => {
    const t = calculateTotals(medAvdrag, true);
    expect(t.vatGroups).toEqual([
      { rate: 25, net: -100, vat: -25 },
      { rate: 6, net: 1000, vat: 60 },
    ]);
    expect(t.net).toBe(900);
    expect(t.vat).toBe(35);
  });

  test("B2: den negativa momsen BOKFÖRS, och konteringen balanserar [BFL 4 kap.]", () => {
    const t = calculateTotals(medAvdrag, true);
    const p = invoicePostingRows(medAvdrag, t, true);
    expect(sums(p).debit).toBe(sums(p).credit);
    // Negativ utgående moms är en DEBET på 2611, inte en negativ kredit.
    expect(acc(p, 2611)[0]).toMatchObject({ debit: 25, credit: 0 });
    expect(acc(p, 2631)[0]).toMatchObject({ debit: 0, credit: 60 });
    // Prisavdraget minskar intäkten: debet på intäktskontot.
    expect(acc(p, 3011)[0]).toMatchObject({ debit: 100, credit: 0 });
  });

  test("B3: inget belopp bokförs någonsin som en negativ kredit eller negativ debet", () => {
    const t = calculateTotals(medAvdrag, true);
    for (const p of invoicePostingRows(medAvdrag, t, true)) {
      expect([p.account, p.debit >= 0 && p.credit >= 0]).toEqual([p.account, true]);
    }
  });

  test("B4: en sats utan utgående momskonto stoppas — den kan inte bokföras", () => {
    // 9 kap. ML har bara 25, 12 och 6 procent. En rad med 8 % skulle debiteras
    // kunden men aldrig bokföras och aldrig redovisas.
    const atta: Row[] = [row({ quantity: 1, unitPrice: 1000, vatRate: 8 })];
    const t = calculateTotals(atta, true);
    expect(() => invoicePostingRows(atta, t, true)).toThrow(/25, 12, 6 och 0/);
  });

  test("B5: databasen tillåter inte heller en annan sats än 25, 12, 6 eller 0", () => {
    for (const table of ["invoice_rows", "articles", "supplier_invoices"]) {
      expect(SQL_ALL, `${table} saknar spärr mot ogiltig momssats`)
        .toMatch(new RegExp(`alter table ${table}[\\s\\S]{0,200}?vat_rate in \\(0, 6, 12, 25\\)`, "i"));
    }
  });
});

// ===========================================================================
// C. Kreditfakturan speglar ursprungsfakturan exakt [ML 17 kap. 22 §]
// ===========================================================================

describe("C. Kreditfaktura speglar ursprungsfakturan exakt [ML 17 kap. 22 §]", () => {
  test("C1: hel kreditering utan öresavrundning ger exakt negerade belopp", () => {
    const rows = [row({ quantity: 2, unitPrice: 100, vatRate: 25 })];
    const orig = calculateTotals(rows, true);
    const kredit = calculateTotals(mirrorRows(rows), true);
    expect(orig.total).toBe(250);
    expect(kredit.net).toBe(-orig.net);
    expect(kredit.vat).toBe(-orig.vat);
    expect(kredit.total).toBe(-orig.total);
    expect(orig.rounding).toBe(0);
    expect(kredit.rounding + 0).toBe(0);
  });

  test("C2: kreditering av faktura med öresavrundning uppåt (0,50) ger samma krontal tillbaka", () => {
    // 100,40 + 25,10 moms = 125,50 → fakturan avrundas till 126,00 och det är
    // beloppet som bokförts på 1510 och står i reskontran. Krediteringen ska
    // återföra exakt 126,00 — annars står 1 krona kvar som fordran på kunden.
    // Det kräver att avrundningen är teckensymmetrisk (halvor bort från noll).
    const rows = [row({ quantity: 1, unitPrice: 100.4, vatRate: 25 })];
    const orig = calculateTotals(rows, true);
    expect(orig.total).toBe(126);
    expect(orig.rounding).toBe(0.5);

    const kredit = calculateTotals(mirrorRows(rows), true);
    expect(kredit.total).toBe(-126);
    expect(kredit.rounding).toBe(-0.5);
  });

  test("C3: kreditering får inte flytta momsen ett öre", () => {
    // 40,02 × 25 % = 10,005 → 10,01 i utgående moms på originalet.
    // Ändringsfakturan ska minska tidigare redovisad utgående skatt med
    // samma 10,01 (Skatteverket, "Redovisning av kreditnota").
    const rows = [row({ quantity: 1, unitPrice: 40.02, vatRate: 25 })];
    const orig = calculateTotals(rows, true);
    expect(orig.vat).toBe(10.01);

    const kredit = calculateTotals(mirrorRows(rows), true);
    expect(kredit.vat).toBe(-10.01);
    expect(kredit.vatGroups[0].vat).toBe(-10.01);
  });

  test("C4: delkreditering av blandade satser minskar varje underlag för sig", () => {
    const rows: Row[] = [
      row({ quantity: 10, unitPrice: 100, vatRate: 25, account: 3011 }),
      row({ quantity: 10, unitPrice: 50, vatRate: 6, account: 3013 }),
    ];
    // Halva leveransen krediteras
    const halv = rows.map((r) => ({ ...r, quantity: -r.quantity / 2 }));
    const k = calculateTotals(halv, true);
    expect(k.vatGroups).toEqual([
      { rate: 25, net: -500, vat: -125 },
      { rate: 6, net: -250, vat: -15 },
    ]);
    expect(k.total).toBe(-890);
  });

  test("C5: kreditfakturans kontering balanserar och vänder varje sida", () => {
    const rows = [row({ quantity: 1, unitPrice: 100.4, vatRate: 25 })];
    const k = calculateTotals(mirrorRows(rows), true);
    const p = invoicePostingRows(mirrorRows(rows), k, true);
    expect(sums(p).debit).toBe(sums(p).credit);
    expect(acc(p, 1510)[0]).toMatchObject({ debit: 0, credit: 126 });
    expect(acc(p, 2611)[0]).toMatchObject({ debit: 25.1, credit: 0 });
    expect(acc(p, 3011)[0]).toMatchObject({ debit: 100.4, credit: 0 });
  });
});

// ===========================================================================
// D. Reskontran måste gå att stämma av mot 1510 [BFL 4 kap. 2 §]
// ===========================================================================

describe("D. Kreditering och betalning kan inte lämna 1510 utan motpost [BFL 4:2]", () => {
  test("D1: databasen vägrar kreditera en faktura med registrerad betalning", () => {
    // En kreditfaktura vänder HELA fakturan. Är den delbetald blir 1510 fel med
    // det betalda beloppet, och varken originalet (status 'credited') eller
    // kreditfakturan (type 'credit') räknas som öppen post i avstämningen.
    expect(SQL_ALL).toMatch(/create or replace function invoices_credit_guard_insert/i);
    const fn = /create or replace function invoices_credit_guard_insert[\s\S]*?\$\$;/i.exec(SQL_ALL)![0];
    expect(fn).toMatch(/from invoice_payments where invoice_id = new\.credits_invoice_id/i);
    expect(fn).toMatch(/raise exception/i);
    expect(SQL_ALL).toMatch(/create trigger trg_invoices_credit_guard_insert[\s\S]*?before insert on invoices/i);
  });

  test("D2: databasen vägrar betalning på krediterad, makulerad eller obokförd faktura", () => {
    const fn = /create or replace function invoice_payments_guard_insert[\s\S]*?\$\$;/i.exec(SQL_ALL)![0];
    for (const status of ["draft", "credited", "cancelled"]) {
      expect(fn, `status ${status} måste stoppas`).toContain(`'${status}'`);
    }
    expect(SQL_ALL).toMatch(/create trigger trg_invoice_payments_guard_insert[\s\S]*?before insert on invoice_payments/i);
  });
});

// ===========================================================================
// E. Påminnelseavgiftens lagstadgade tak [INK 2 §, 4 §]
// ===========================================================================

describe("E. Påminnelseavgiften har ett tak i lag [INK 4 § 2 st]", () => {
  test("E1: taket ligger som regelvärde, inte hårdkodat, och är 60 kr", () => {
    // 4 § andra stycket: "ersättningsskyldigheten omfattar [...] 60 kronor för
    // en skriftlig betalningspåminnelse". Värdet ligger i rule_values så att det
    // syns på regelsidan och kan ändras utan kodändring om lagen ändras.
    expect(SQL_ALL).toMatch(/insert into rule_values[\s\S]{0,200}'paminnelseavgift_max',\s*60\.00/i);
  });

  test("E2: server-actionen prövar avgiften mot taket innan påminnelsen skapas", () => {
    // Utan spärren accepterade createReminder vilket belopp som helst — 500 kr
    // gick igenom, och avgiften hamnade på ett krav mot en kund.
    const src = readFileSync(
      fileURLToPath(new URL("../../actions/invoices.ts", import.meta.url)), "utf8");
    expect(src).toMatch(/paminnelseavgift_max/);
    expect(src).toMatch(/fee > maxFee/);
    expect(src).toMatch(/1981:739/);
  });

  test("E3: påminnelse kan inte skapas på en faktura som inte är öppen", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../actions/invoices.ts", import.meta.url)), "utf8");
    for (const status of ["paid", "credited", "cancelled", "draft"]) {
      expect(src, `status ${status} måste stoppas`).toContain(`"${status}"`);
    }
    // Och inte före förfallodagen — en påminnelse om en skuld som inte förfallit
    // är ingen betalningspåminnelse i lagens mening [INK 2 §].
    expect(src).toMatch(/inv\.due_date >= today/);
  });

  test("E4: regelvärdet slås upp på affärshändelsens datum, inte på dagens", () => {
    // Ett datumstyrt belopp som slås upp med fel datum ger fel svar för en
    // efterhandsbokförd händelse. Raden som gäller är den med senaste valid_from
    // som inte ligger efter datumet, och vars valid_to inte passerat.
    const rows = [
      { value: 50, valid_from: "2024-01-01", valid_to: "2025-12-31" },
      { value: 60, valid_from: "2026-01-01", valid_to: null },
    ];
    expect(pickRuleValue(rows, "2025-06-01")).toBe(50);
    expect(pickRuleValue(rows, "2026-06-01")).toBe(60);
    expect(pickRuleValue(rows, "2023-06-01")).toBeNull();
    expect(pickRuleValue([], "2026-06-01")).toBeNull();
    expect(pickRuleValue(null, "2026-06-01")).toBeNull();
  });

  test("E5: en rad som gått ut gäller inte, även om ingen ersatt den", () => {
    const rows = [{ value: 50, valid_from: "2024-01-01", valid_to: "2025-12-31" }];
    expect(pickRuleValue(rows, "2026-01-01")).toBeNull();
  });
});

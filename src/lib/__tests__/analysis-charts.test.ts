import { describe, it, expect } from "vitest";
import {
  costByClass, grossMarginByMonth, paretoOf, topWithRest, agingBuckets, daysBetween,
} from "@/lib/analysis-charts";

describe("costByClass", () => {
  it("fördelar kostnaderna på BAS-kontoklass med andelar", () => {
    const { segments, total } = costByClass([
      { account: 4010, amount: 300 },
      { account: 4020, amount: 100 },
      { account: 5010, amount: 400 },
      { account: 7010, amount: 200 },
    ]);
    expect(total).toBe(1000);
    expect(segments.map((s) => [s.label, s.value, s.share])).toEqual([
      ["Varor, material och köpta tjänster", 400, 0.4],
      ["Lokal, förbrukning och resor", 400, 0.4],
      ["Personal och avskrivningar", 200, 0.2],
    ]);
  });

  it("ignorerar konton utanför 4000–7999", () => {
    const { total } = costByClass([
      { account: 3010, amount: 999 },
      { account: 8410, amount: 999 },
      { account: 6110, amount: 50 },
    ]);
    expect(total).toBe(50);
  });

  it("utelämnar klasser med noll eller negativt netto — en andel kan inte vara negativ", () => {
    const { segments } = costByClass([
      { account: 4010, amount: 100 },
      { account: 5010, amount: -80 },
      { account: 6010, amount: 0 },
    ]);
    expect(segments.map((s) => s.label)).toEqual(["Varor, material och köpta tjänster"]);
  });

  it("ger tom lista utan att dela med noll när ingenting är bokfört", () => {
    expect(costByClass([])).toEqual({ segments: [], total: 0 });
  });
});

describe("grossMarginByMonth", () => {
  it("räknar marginalen i procent", () => {
    expect(grossMarginByMonth([1000, 500], [400, 100])).toEqual([60, 80]);
  });

  it("ger null för månader utan omsättning — inte noll", () => {
    // Noll marginal och ingen försäljning alls är två olika saker; en linje som
    // dyker till noll i juli skulle påstå det första.
    expect(grossMarginByMonth([0, 100], [0, 50])).toEqual([null, 50]);
  });

  it("klarar negativ marginal när varukostnaden överstiger intäkten", () => {
    expect(grossMarginByMonth([100], [150])).toEqual([-50]);
  });

  it("saknad varukostnad räknas som noll", () => {
    expect(grossMarginByMonth([200], [])).toEqual([100]);
  });
});

describe("paretoOf", () => {
  const entries = [["A", 50], ["B", 30], ["C", 20]] as const;

  it("sorterar fallande och ackumulerar andelen", () => {
    const { items, total } = paretoOf(entries);
    expect(total).toBe(100);
    expect(items.map((i) => [i.label, i.share, i.cumulative])).toEqual([
      ["A", 0.5, 0.5],
      ["B", 0.3, 0.8],
      ["C", 0.2, 1],
    ]);
  });

  it("räknar andelarna mot hela totalen, inte mot topplistan", () => {
    // Annars ser varje företag ut att ha 100 % av omsättningen hos topp 2
    const { items, total, restCount, restValue } = paretoOf(entries, 2);
    expect(total).toBe(100);
    expect(items.at(-1)!.cumulative).toBe(0.8);
    expect({ restCount, restValue }).toEqual({ restCount: 1, restValue: 20 });
  });

  it("hoppar över rena krediteringar", () => {
    const { items, total } = paretoOf([["A", 100], ["B", -40], ["C", 0]]);
    expect(items.map((i) => i.label)).toEqual(["A"]);
    expect(total).toBe(100);
  });

  it("delar inte med noll när allt är tomt", () => {
    expect(paretoOf([])).toEqual({ items: [], total: 0, restCount: 0, restValue: 0 });
  });
});

describe("topWithRest", () => {
  it("lägger resten i en samlingspost", () => {
    expect(topWithRest([["A", 5], ["B", 4], ["C", 3], ["D", 2]], 2)).toEqual([
      { label: "A", value: 5 },
      { label: "B", value: 4 },
      { label: "Övriga 2 st", value: 5 },
    ]);
  });

  it("lägger inte till en tom samlingspost när allt får plats", () => {
    expect(topWithRest([["A", 5]], 10)).toEqual([{ label: "A", value: 5 }]);
  });
});

describe("daysBetween", () => {
  it("räknar hela dagar", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-03-10", "2026-03-01")).toBe(-9);
  });

  it("påverkas inte av sommartidens omställning", () => {
    // 2026-03-29 är omställningsdagen i Sverige — dygnet är 23 timmar lokalt
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("agingBuckets", () => {
  const today = "2026-03-01";

  it("placerar fakturorna i rätt åldersfack", () => {
    const b = agingBuckets([
      { dueDate: "2026-04-01", outstanding: 100 },  // inte förfallen
      { dueDate: "2026-03-01", outstanding: 200 },  // förfaller i dag
      { dueDate: "2026-02-20", outstanding: 300 },  // 9 dagar sen
      { dueDate: "2026-01-20", outstanding: 400 },  // 40 dagar sen
      { dueDate: "2025-11-01", outstanding: 500 },  // 120 dagar sen
    ], today);
    expect(b.map((x) => [x.label, x.value, x.count])).toEqual([
      ["Inte förfallet", 300, 2],
      ["1–30 dagar sent", 300, 1],
      ["31–60 dagar sent", 400, 1],
      ["Över 60 dagar sent", 500, 1],
    ]);
  });

  it("räknar en faktura utan förfallodatum som ej förfallen", () => {
    const b = agingBuckets([{ dueDate: null, outstanding: 100 }], today);
    expect(b[0]).toMatchObject({ value: 100, count: 1 });
  });

  it("utelämnar färdigbetalda och överbetalda fakturor", () => {
    const b = agingBuckets([
      { dueDate: "2026-01-01", outstanding: 0 },
      { dueDate: "2026-01-01", outstanding: -50 },
    ], today);
    expect(b.every((x) => x.value === 0 && x.count === 0)).toBe(true);
  });

  it("markerar vilka fack som är förfallna", () => {
    expect(agingBuckets([], today).map((b) => b.overdue)).toEqual([false, true, true, true]);
  });
});

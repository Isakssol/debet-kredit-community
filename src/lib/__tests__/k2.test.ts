import { describe, it, expect } from "vitest";
import { buildK2Report } from "@/lib/k2/report";

// Litet AB: aktiekapital 25 000, försäljning 100 000, kostnader 40 000,
// lön 20 000 + avgifter 6 284, skatt bokförd 6 000, resultat mot 2099.
const lines = [
  { account: 1930, closing: 71716 },     // bank
  { account: 1510, closing: 10000 },     // kundfordringar
  { account: 2081, closing: -25000 },    // aktiekapital
  { account: 2099, closing: -27716 },    // årets resultat (bokfört)
  { account: 2440, closing: -5000 },     // leverantörsskulder
  { account: 2510, closing: -6000 },     // skatteskuld
  { account: 2710, closing: -4000 },     // personalskatt
  { account: 2731, closing: -2000 },     // sociala avgifter
  { account: 2611, closing: -12000 },    // utgående moms
  { account: 3011, closing: -100000 },   // försäljning
  { account: 5420, closing: 40000 },     // programvara
  { account: 7210, closing: 20000 },     // lön
  { account: 7510, closing: 6284 },      // arbetsgivaravgift
  { account: 8910, closing: 6000 },      // skatt på årets resultat
];

describe("buildK2Report", () => {
  const r = buildK2Report(lines);

  it("beräknar nettoomsättning och årets resultat", () => {
    expect(r.netRevenue).toBe(100000);
    expect(r.result).toBe(100000 - 40000 - 20000 - 6284 - 6000);
  });

  it("balansräkningen balanserar", () => {
    expect(r.balances.assets).toBe(81716);
    expect(r.balances.equityAndLiabilities).toBe(81716);
  });

  it("eget kapital delas upp korrekt", () => {
    expect(r.equity.shareCapital).toBe(25000);
    expect(r.equity.yearResult).toBe(27716); // bokfört 2099 används
    expect(r.equity.total).toBe(52716);
  });

  it("personalkostnader och skatt hamnar på egna rader", () => {
    const pers = r.incomeStatement.find((x) => x.label === "Personalkostnader");
    expect(pers?.amount).toBe(-26284);
    const tax = r.incomeStatement.find((x) => x.label.startsWith("Skatt"));
    expect(tax?.amount).toBe(-6000);
  });

  it("momsskuld ingår i skatteskulder-raden (skulder visas positiva)", () => {
    const taxRow = r.balanceEquityLiabilities.find((x) => x.label.includes("Skatteskulder"));
    expect(taxRow?.amount).toBe(6000 + 4000 + 2000 + 12000);
  });
});

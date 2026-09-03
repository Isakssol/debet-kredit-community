import { describe, it, expect } from "vitest";
import { matchingRules, buildRuleRows, type BankRule, type RuleTx } from "@/lib/bank/rules";

const rule = (over: Partial<BankRule> = {}): BankRule => ({
  id: "r1", name: "Bankavgift", match_text: "pris enl spec", direction: "out",
  account: 6570, vat_rate: 0, liquidity_account: 1930, ...over,
});

const tx = (over: Partial<RuleTx> = {}): RuleTx => ({
  id: "t1", booking_date: "2026-08-15", amount: -120,
  description: "PRIS ENL SPEC", counterpart: null, ...over,
});

describe("matchingRules", () => {
  it("matchar skiftlägesokänsligt på beskrivning", () => {
    expect(matchingRules(tx(), [rule()])).toHaveLength(1);
  });
  it("matchar på motpart", () => {
    expect(matchingRules(
      tx({ description: "Betalning", counterpart: "Telia Sverige AB" }),
      [rule({ match_text: "telia" })]
    )).toHaveLength(1);
  });
  it("respekterar riktning", () => {
    expect(matchingRules(tx({ amount: 500 }), [rule({ direction: "out" })])).toHaveLength(0);
    expect(matchingRules(tx({ amount: 500 }), [rule({ direction: "both" })])).toHaveLength(1);
  });
  it("ignorerar tomma matchtexter", () => {
    expect(matchingRules(tx(), [rule({ match_text: "  " })])).toHaveLength(0);
  });
});

describe("buildRuleRows", () => {
  it("momsfri utgift: kostnad + kredit likvid", () => {
    expect(buildRuleRows(tx({ amount: -120 }), rule())).toEqual([
      { account: 6570, debit: 120, credit: 0 },
      { account: 1930, debit: 0, credit: 120 },
    ]);
  });
  it("utgift med 25 % moms delas netto + 2640 och balanserar", () => {
    const rows = buildRuleRows(tx({ amount: -125 }), rule({ account: 6212, vat_rate: 25 }));
    expect(rows).toEqual([
      { account: 6212, debit: 100, credit: 0 },
      { account: 2640, debit: 25, credit: 0 },
      { account: 1930, debit: 0, credit: 125 },
    ]);
  });
  it("öresbelopp balanserar exakt", () => {
    const rows = buildRuleRows(tx({ amount: -99.99 }), rule({ account: 6212, vat_rate: 25 }));
    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    expect(Math.round((debit - credit) * 100)).toBe(0);
  });
  it("intäkt med moms: debet likvid, kredit intäkt + 2611", () => {
    expect(buildRuleRows(
      tx({ amount: 1250 }),
      rule({ direction: "in", account: 3011, vat_rate: 25, liquidity_account: 1940 })
    )).toEqual([
      { account: 1940, debit: 1250, credit: 0 },
      { account: 3011, debit: 0, credit: 1000 },
      { account: 2611, debit: 0, credit: 250 },
    ]);
  });
  it("12 % intäktsmoms hamnar på 2621", () => {
    const rows = buildRuleRows(
      tx({ amount: 112 }),
      rule({ direction: "in", account: 3011, vat_rate: 12 })
    );
    expect(rows.find((r) => r.account === 2621)?.credit).toBe(12);
  });
});

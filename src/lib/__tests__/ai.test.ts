import { describe, it, expect } from "vitest";
import { validateSuggestion } from "../ai/bookkeeper";
import { extractJson } from "../ai/provider";

const ACCOUNTS = new Set([1930, 2018, 2640, 5410, 6110, 6072]);

describe("AI-förslagsvalidering", () => {
  it("godkänner balanserat förslag", () => {
    const res = validateSuggestion({
      datum: "2026-07-01", motpart: "Dustin", beskrivning: "Skärm",
      total_inkl_moms: 500, moms_belopp: 100, moms_sats: 25, betalsatt: "foretagskonto",
      rader: [
        { account: 6110, debit: 400, credit: 0 },
        { account: 2640, debit: 100, credit: 0 },
        { account: 1930, debit: 0, credit: 500 },
      ],
      varningar: [], fraga: null, confidence: "hog",
    }, ACCOUNTS);
    expect(res.ok).toBe(true);
  });

  it("avvisar okänt konto", () => {
    const res = validateSuggestion({
      datum: "2026-07-01",
      rader: [
        { account: 9999, debit: 100, credit: 0 },
        { account: 1930, debit: 0, credit: 100 },
      ],
    }, ACCOUNTS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("9999");
  });

  it("justerar öresdiff ≤ 1 kr mot största raden", () => {
    const res = validateSuggestion({
      datum: "2026-07-01",
      rader: [
        { account: 6110, debit: 400.37, credit: 0 },
        { account: 2640, debit: 100.09, credit: 0 },
        { account: 1930, debit: 0, credit: 500.45 },
      ],
    }, ACCOUNTS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const d = res.suggestion.rader.reduce((s, r) => s + r.debit, 0);
      const k = res.suggestion.rader.reduce((s, r) => s + r.credit, 0);
      expect(Math.round(d * 100)).toBe(Math.round(k * 100));
    }
  });

  it("avvisar diff över 1 kr", () => {
    const res = validateSuggestion({
      datum: "2026-07-01",
      rader: [
        { account: 6110, debit: 400, credit: 0 },
        { account: 1930, debit: 0, credit: 500 },
      ],
    }, ACCOUNTS);
    expect(res.ok).toBe(false);
  });

  it("ogiltigt datum ersätts med dagens", () => {
    const res = validateSuggestion({
      datum: "igår",
      rader: [
        { account: 6110, debit: 100, credit: 0 },
        { account: 1930, debit: 0, credit: 100 },
      ],
    }, ACCOUNTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.suggestion.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("JSON-extrahering ur AI-svar", () => {
  it("ren JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("JSON i kodstaket med omgivande text", () => {
    expect(extractJson('Här är förslaget:\n```json\n{"a":1}\n```\nKlart!')).toEqual({ a: 1 });
  });
  it("JSON med text runt utan staket", () => {
    expect(extractJson('Förslag: {"rader":[{"account":6110}]} slut')).toEqual({
      rader: [{ account: 6110 }],
    });
  });
});

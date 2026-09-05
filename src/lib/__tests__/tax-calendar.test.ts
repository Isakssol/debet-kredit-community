/**
 * Skattekalendern och F-skattefrågan.
 *
 * KÄLLOR
 *  [SFL 55:2-3]  55 kap. 2–3 §§ skatteförfarandelagen (2011:1244): debiterad
 *                preliminärskatt betalas av den som Skatteverket har BESLUTAT
 *                om sådan för. Alla F-skattegodkända har inte ett sådant beslut.
 *  [SFL 62:3-4]  62 kap. 3 § SFL: skatten ska betalas senast den 12:e i
 *                månaden; 62 kap. 4 §: i januari och augusti den 17:e.
 */
import { describe, expect, test } from "vitest";
import {
  taxDeadlines, needsFTaxAnswer, F_TAX_PROMPT, TAX_CALENDAR_SOURCE,
} from "../tax-calendar";

const fSkatt = (paysFTax: boolean | null | undefined) =>
  taxDeadlines(2026, "kvartal", false, paysFTax).filter((d) => d.type === "f_skatt");

describe("skattekalendern och F-skattefrågan", () => {
  test("ja: tolv F-skattedatum, den 12:e utom 17:e i januari och augusti [SFL 62:3-4]", () => {
    const rows = fSkatt(true);
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.dueDate)).toEqual([
      "2026-01-17", "2026-02-12", "2026-03-12", "2026-04-12",
      "2026-05-12", "2026-06-12", "2026-07-12", "2026-08-17",
      "2026-09-12", "2026-10-12", "2026-11-12", "2026-12-12",
    ]);
    expect(new Set(rows.map((r) => r.title)))
      .toEqual(new Set(["F-skatt (debiterad preliminärskatt)"]));
  });

  test("nej: inga F-skattedatum alls [SFL 55:2-3]", () => {
    expect(fSkatt(false)).toHaveLength(0);
  });

  test("obesvarad: inga F-skattedatum — programmet gissar inte [SFL 55:2-3]", () => {
    expect(fSkatt(null)).toHaveLength(0);
    expect(fSkatt(undefined)).toHaveLength(0);
  });

  test("moms, periodisk sammanställning och inkomstdeklaration är oberoende av F-skattesvaret", () => {
    const other = (paysFTax: boolean | null) =>
      taxDeadlines(2026, "kvartal", true, paysFTax).filter((d) => d.type !== "f_skatt");
    expect(other(null)).toEqual(other(true));
    expect(other(false)).toEqual(other(true));
    // Kvartalsmoms + fyra periodiska sammanställningar + inkomstdeklarationen
    expect(other(null).filter((d) => d.type === "periodisk_sammanstallning")).toHaveLength(4);
    expect(other(null).filter((d) => d.type === "inkomstdeklaration")).toHaveLength(1);
  });

  test("listan är fortfarande sorterad på förfallodatum i alla tre lägena", () => {
    for (const answer of [true, false, null] as const) {
      const dates = taxDeadlines(2026, "manad", true, answer).map((d) => d.dueDate);
      expect(dates).toEqual([...dates].sort((a, b) => a.localeCompare(b)));
    }
  });
});

describe("den mjuka raden i Att göra", () => {
  test("visas bara när frågan är obesvarad", () => {
    expect(needsFTaxAnswer(null)).toBe(true);
    expect(needsFTaxAnswer(undefined)).toBe(true);
    expect(needsFTaxAnswer(true)).toBe(false);
    expect(needsFTaxAnswer(false)).toBe(false);
  });

  test("raden pekar på inställningen som ger svaret", () => {
    expect(F_TAX_PROMPT.href).toBe("/installningar#f-skatt");
    expect(F_TAX_PROMPT.text).toContain("debiterad preliminärskatt");
  });

  test("källraden säger var datumen kommer ifrån", () => {
    expect(TAX_CALENDAR_SOURCE).toContain("företagsinställningar");
  });
});

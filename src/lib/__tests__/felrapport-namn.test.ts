import { describe, it, expect } from "vitest";
import { buildNameRedactor, usableNames, REDACT_MASK } from "@/lib/redact-names";
import { buildFeedbackPayload } from "@/lib/feedback";

/**
 * Namnmaskeringen — det saneringslager som mönstermatchning inte kan göra.
 *
 * Testet skrevs efter att en skarp körning visat att "Bengtssons Bageri AB"
 * följde med hela vägen ut till mottagaren, i tre fält samtidigt, medan varje
 * belopp och identifierare i samma mening maskades korrekt. Rutan "Skickas
 * aldrig" lovade då något koden inte höll.
 */

describe("usableNames", () => {
  it("plockar bort för korta namn", () => {
    expect(usableNames(["AB", "Ida", "Nord", "Bengtssons Bageri AB"]))
      .toEqual(["Bengtssons Bageri AB", "Nord"]);
  });

  it("tar längsta först, så ett namn inte halveras av sitt eget förled", () => {
    const list = usableNames(["Bengtssons", "Bengtssons Bageri AB"]);
    expect(list[0]).toBe("Bengtssons Bageri AB");
  });

  it("avduplicerar oavsett skiftläge och blanksteg", () => {
    expect(usableNames(["Nordvik  AB", "nordvik ab", " Nordvik AB "]))
      .toEqual(["Nordvik AB"]);
  });
});

describe("buildNameRedactor", () => {
  const redact = buildNameRedactor(["Bengtssons Bageri AB", "Nordvik", "Åkessons Åkeri"]);

  it("maskar hela namnet, inte halva", () => {
    expect(redact("Kunde inte spara kund Bengtssons Bageri AB: konto saknas"))
      .toBe(`Kunde inte spara kund ${REDACT_MASK}: konto saknas`);
  });

  it("bryr sig inte om skiftläge", () => {
    expect(redact("faktura till NORDVIK skickad")).toBe(`faktura till ${REDACT_MASK} skickad`);
  });

  it("klarar svenska bokstäver i namnet", () => {
    expect(redact("Åkessons Åkeri fick fel moms")).toBe(`${REDACT_MASK} fick fel moms`);
  });

  it("maskar inte mitt inne i ett längre ord", () => {
    expect(redact("Nordvikingarna är ett annat ord")).toBe("Nordvikingarna är ett annat ord");
  });

  it("lämnar felsökningstext orörd", () => {
    const kept = "TypeError: Cannot read properties of undefined (reading 'belopp')";
    expect(redact(kept)).toBe(kept);
  });

  it("utan namn är den identiteten, inte en kostnad", () => {
    const tom = buildNameRedactor([]);
    expect(tom("Bengtssons Bageri AB")).toBe("Bengtssons Bageri AB");
  });
});

describe("buildFeedbackPayload med namnmaskering", () => {
  const redact = buildNameRedactor(["Bengtssons Bageri AB"]);

  it("maskar namnet i kundens egen text, rubrik som beskrivning", () => {
    const payload = buildFeedbackPayload({
      type: "bug",
      title: "Fakturan till Bengtssons Bageri AB blev fel",
      message: "Jag skulle fakturera Bengtssons Bageri AB 12 450,00 kr men vyn small.",
      redact,
    });
    expect(payload.title).not.toContain("Bengtssons");
    expect(payload.message).not.toContain("Bengtssons");
    expect(payload.message).not.toContain("12 450");
    // Felsökningsvärdet ska stå kvar: vad kunden försökte göra syns fortfarande.
    expect(payload.message).toContain("men vyn small");
  });

  it("maskar namnet i klientfel och loggrader", () => {
    const payload = buildFeedbackPayload({
      type: "bug",
      title: "Vyn kraschar",
      message: "Den kraschar varje gång jag öppnar den.",
      technical: {
        clientErrors: [{
          at: "2026-09-05T15:00:00.000Z",
          kind: "error",
          message: "Error: Kunde inte spara kund Bengtssons Bageri AB",
          source: "app-1234.js:12:5",
          count: 1,
        }],
        appLogExcerpt: [{
          at: "2026-09-05T14:59:00.000Z",
          level: "error",
          source: "bokforing",
          message: "Bokföring misslyckades för Bengtssons Bageri AB",
        }],
      },
      redact,
    });
    const ut = JSON.stringify(payload);
    expect(ut).not.toContain("Bengtssons");
    expect(ut).toContain("Kunde inte spara kund");
    expect(ut).toContain("app-1234.js:12:5");
  });

  it("utan redaktör beter sig som förut — mottagarsidan tappar inget", () => {
    const payload = buildFeedbackPayload({
      type: "bug",
      title: "Rubrik utan maskering",
      message: "Beskrivning utan maskering alls.",
    });
    expect(payload.title).toBe("Rubrik utan maskering");
  });
});

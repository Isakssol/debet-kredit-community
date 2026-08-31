import { describe, it, expect } from "vitest";
import { buildInfoSru, buildBlanketterSru } from "@/lib/sru/build";

const created = new Date("2026-05-01T08:30:00Z");
const party = { id12: "198501012385", name: "Test Firma", postalCode: "722 12", city: "Västerås" };

describe("buildInfoSru", () => {
  const info = buildInfoSru(party, created, "Debet & Kredit");
  it("följer postordningen och obligatoriska poster", () => {
    const lines = info.split("\r\n");
    expect(lines[0]).toBe("#DATABESKRIVNING_START");
    expect(lines[1]).toBe("#PRODUKT SRU");
    expect(lines).toContain("#FILNAMN BLANKETTER.SRU");
    expect(lines).toContain("#ORGNR 198501012385");
    expect(lines).toContain("#POSTNR 72212");
    expect(lines).toContain("#MEDIELEV_SLUT");
  });
});

describe("buildBlanketterSru", () => {
  const base = {
    taxYear: 2026, id12: party.id12, name: party.name,
    fiscalStart: "2026-01-01", fiscalEnd: "2026-12-31",
    activityDescription: "Motoroptimering",
    neValues: new Map([["B9", 58207.02], ["B10", -19000], ["R1", 66100.8], ["R6", 40000.4]]),
    bookedResult: 26100,
    created,
  };
  const sru = buildBlanketterSru(base);

  it("skapar NE-block med rätt koder och hela kronor", () => {
    expect(sru).toContain("#BLANKETT NE-2026P4");
    expect(sru).toContain("#UPPGIFT 7011 20260101");
    expect(sru).toContain("#UPPGIFT 7280 58207");   // B9
    expect(sru).toContain("#UPPGIFT 7300 -19000");  // B10 behåller tecken
    expect(sru).toContain("#UPPGIFT 7400 66101");   // R1
    expect(sru).toContain("#UPPGIFT 7501 40000");   // R6
    expect(sru).toContain("#UPPGIFT 7440 26100");   // R11
  });

  it("räknar schablonavdrag och överskott: R43 25 %, R47 → INK1 1200", () => {
    expect(sru).toContain("#UPPGIFT 7714 6525");    // 25 % av 26100
    expect(sru).toContain("#UPPGIFT 7630 19575");   // R47
    expect(sru).toContain("#BLANKETT INK1-2026P4");
    expect(sru).toContain("#UPPGIFT 1200 19575");   // 10.1 aktiv EF
    expect(sru).not.toContain("#UPPGIFT 7730");
    expect(sru.trimEnd().endsWith("#FIL_SLUT")).toBe(true);
  });

  it("underskott hamnar på 7730 och INK1 1202, utan R43", () => {
    const loss = buildBlanketterSru({ ...base, bookedResult: -5000 });
    expect(loss).toContain("#UPPGIFT 7440 -5000");
    expect(loss).toContain("#UPPGIFT 7730 5000");
    expect(loss).toContain("#UPPGIFT 1202 5000");
    expect(loss).not.toContain("#UPPGIFT 7714");
    expect(loss).not.toContain("#UPPGIFT 7630");
  });
});

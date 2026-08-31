import { describe, it, expect } from "vitest";
import { buildAgiXml, to12Digits } from "@/lib/payroll/agi";

const input = {
  orgNumber: "556123-4567",
  period: "202608",
  programName: "Debet & Kredit",
  contact: { name: "Anna Andersson", phone: "0701234567", email: "anna@example.se" },
  employee: { personalNumber: "8501012385", grossSalary: 35000, taxDeduction: 7500.4 },
  employerFee: 10997,
  workplace: { address: "Testgatan 1", city: "Västerås" },
  created: new Date("2026-09-01T10:00:00Z"),
};

describe("to12Digits", () => {
  it("prefixar orgnr med 16", () => {
    expect(to12Digits("556123-4567", "org")).toBe("165561234567");
  });
  it("lämnar 12-siffriga id orörda", () => {
    expect(to12Digits("198501012385", "person")).toBe("198501012385");
  });
  it("kastar på ogiltig längd", () => {
    expect(() => to12Digits("12345", "org")).toThrow();
  });
});

describe("buildAgiXml", () => {
  const xml = buildAgiXml(input);

  it("innehåller obligatoriska HU-fältkoder 201/006/487/497", () => {
    expect(xml).toContain('faltkod="201">165561234567<');
    expect(xml).toContain('<agd:RedovisningsPeriod faltkod="006">202608<');
    expect(xml).toContain('<agd:SummaArbAvgSlf faltkod="487">10997<');
    expect(xml).toContain('<agd:SummaSkatteavdr faltkod="497">7500<');
  });
  it("innehåller IU med 215/570/011/001 och arbetsplats 245/246", () => {
    expect(xml).toContain('faltkod="215">198501012385<');
    expect(xml).toContain('faltkod="570">001<');
    expect(xml).toContain('faltkod="011">35000<');
    expect(xml).toContain('faltkod="001">7500<');
    expect(xml).toContain('faltkod="245">Testgatan 1<');
    expect(xml).toContain('faltkod="246">Västerås<');
  });
  it("avrundar till hela kronor i AGI", () => {
    expect(xml).not.toContain("7500.4");
    expect(xml).not.toContain("7500,4");
  });
  it("XML-escapar avsändardata", () => {
    const evil = buildAgiXml({ ...input, contact: { ...input.contact, name: "A & B <AB>" } });
    expect(evil).toContain("A &amp; B &lt;AB&gt;");
  });
  it("vägrar ogiltig period", () => {
    expect(() => buildAgiXml({ ...input, period: "202613" })).toThrow();
  });
});

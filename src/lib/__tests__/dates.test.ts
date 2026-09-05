import { describe, it, expect, afterEach, vi } from "vitest";
import { addDays, todayISO, toISODate } from "@/lib/dates";

/**
 * Bokföringsdatum är kalenderdatum, inte tidpunkter.
 *
 * Testerna körs i svensk tid (UTC+1/+2), där det gamla mönstret
 * `new Date(d + "T00:00:00").toISOString().slice(0,10)` gav en dag för tidigt.
 * Förfallodagen styr när dröjsmålsränta börjar löpa (räntelagen 1975:635, 3 §)
 * och när en påminnelseavgift får tas ut (lagen 1981:739 om ersättning för
 * inkassokostnader m.m., 2 och 4 §§), så en dag fel är en dag för mycket.
 */
describe("addDays", () => {
  it("30 dagars betalningsvillkor ger förfallodag 30 dagar senare", () => {
    expect(addDays("2026-09-02", 30)).toBe("2026-10-02");
    expect(addDays("2026-09-03", 30)).toBe("2026-10-03");
    expect(addDays("2026-09-10", 30)).toBe("2026-10-10");
  });

  it("noll dagar lämnar datumet orört", () => {
    expect(addDays("2026-12-01", 0)).toBe("2026-12-01");
    expect(addDays("2026-01-01", 0)).toBe("2026-01-01");
  });

  it("räknar rätt över månads- och årsskifte", () => {
    expect(addDays("2026-01-15", 30)).toBe("2026-02-14");
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01"); // 2026 är inte skottår
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // 2028 är skottår
  });

  it("påverkas inte av sommartidsomställningen", () => {
    // Sverige ställer om sista söndagen i mars och oktober.
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("hanterar negativa dagar", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("avvisar något som inte är ett datum", () => {
    expect(() => addDays("inte ett datum", 1)).toThrow();
    expect(() => addDays("2026-9-2", 1)).toThrow();
  });
});

describe("todayISO", () => {
  afterEach(() => vi.useRealTimers());

  it("ger dagens datum i lokal tid, inte UTC-datumet", () => {
    // 00:30 svensk sommartid = 22:30 UTC dagen innan. Datumet i bokföringen
    // ska vara den 1 juli, inte den 30 juni — annars hamnar verifikatet i fel
    // månad, och vid årsskiftet i fel (kanske avslutat) räkenskapsår.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 0, 30, 0));
    expect(todayISO()).toBe("2026-07-01");

    vi.setSystemTime(new Date(2027, 0, 1, 0, 30, 0));
    expect(todayISO()).toBe("2027-01-01");
  });

  it("ger samma datum sent på kvällen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 23, 45, 0));
    expect(todayISO()).toBe("2026-07-01");
  });
});

describe("toISODate", () => {
  it("nollutfyller månad och dag", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

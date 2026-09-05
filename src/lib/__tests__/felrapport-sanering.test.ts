import { describe, it, expect } from "vitest";
import { sanitize, sanitizeOutbound } from "@/lib/logging";

/**
 * Golden-fall för saneringen av det som LÄMNAR installationen.
 *
 * Varje rad här är ett verkligt läckage som annars hade följt med en
 * felrapport: ett belopp i ett felmeddelande, ett kundnummer i en URL, en
 * e-postadress i en avvisad promise. Testet är avsiktligt skrivet som
 * "före → efter" i stället för med regexpar — reglerna får skrivas om, men
 * utfallet ska stå fast.
 */

const GOLDEN: [string, string][] = [
  // Belopp i alla former appen skriver dem
  ["Fakturan på 12 500,00 kr blev fel", "Fakturan på ••• kr blev fel"],
  ["Summa 1 234,56 kr och SEK 9900", "Summa ••• kr och ••• kr"],
  ["saldo -4 210 kr", "saldo ••• kr"],
  // Person- och organisationsnummer
  ["pnr 19850101-2385", "pnr ••••-••••"],
  ["orgnr 556677-8899", "orgnr ••••-••••"],
  // Betalvägar
  ["bankgiro 5051-6905", "bankgiro ••••-••••"],
  ["plusgiro 4321089-0", "plusgiro ••••-••••"],
  ["IBAN SE45 5000 0000 0583 9825 7466", "IBAN iban-••••"],
  // Identifierare som pekar ut ett verifikat, en kund eller en faktura
  ["verifikat 9f3a1c2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b saknas", "verifikat uuid-•••• saknas"],
  ["kundnummer 100045782", "kundnummer ••••"],
  // E-post: adressen bort alltid. Domänen bara när den inte är kunden själv.
  ["mejl till anna.ek+bok@foretaget.se studsade", "mejl till ••••@••••.se studsade"],
  ["mejl till anna.ek@gmail.com studsade", "mejl till ••••@gmail.com studsade"],
];

describe("sanitizeOutbound — golden-fall", () => {
  for (const [before, after] of GOLDEN) {
    it(`tvättar: ${before}`, () => {
      expect(sanitizeOutbound(before)).toBe(after);
    });
  }

  it("tvättar ett verkligt felmeddelande utan att göra det obegripligt", () => {
    const out = sanitizeOutbound(
      "TypeError: Cannot read properties of undefined (reading 'belopp') vid bokföring av 4 375,50 kr på kund 9f3a1c2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b",
    );
    expect(out).toContain("TypeError: Cannot read properties of undefined");
    expect(out).not.toContain("4 375,50");
    expect(out).not.toContain("9f3a1c2e");
  });

  it("lämnar vanlig felsökningstext orörd", () => {
    const kept = [
      "Påminnelsekörning klar: 3 skickade",
      "konto 1930 debiterades",
      "5 sekunder kvar",
      "GET /api/fakturor svarade 500",
      "app-1234.js:12:5",
    ];
    for (const text of kept) expect(sanitizeOutbound(text)).toBe(text);
  });

  it("bygger på sanitize och tappar inte dess skydd", () => {
    const out = sanitizeOutbound("nyckel sk-ant-api03-abcdefgh12345 och Bearer eyJx.some.token");
    expect(out).not.toContain("sk-ant-api03");
    expect(out).not.toContain("eyJx.some.token");
  });
});

describe("sanitize — oförändrad", () => {
  /**
   * Det lokala lagret är avsiktligt SNÄVARE än det utgående. Kunden ska se
   * sina egna belopp och sina egna id:n i /loggar; det är först på väg ut ur
   * installationen de blir vår sak att inte veta.
   */
  it("maskar inte belopp och id i den egna systemloggen", () => {
    expect(sanitize("Betalning 1 234,56 kr bokförd")).toBe("Betalning 1 234,56 kr bokförd");
    expect(sanitize("verifikat 9f3a1c2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b")).toContain("9f3a1c2e");
  });
});

/**
 * Domänen i en e-postadress. Se licensutgåvans motsvarande fall: en egen
 * domän ÄR kunden, en fri e-posttjänst är det inte.
 */
describe("sanitizeOutbound — domänen i en adress", () => {
  it("kortar en egen domän till toppdomänen", () => {
    expect(sanitizeOutbound("bengt@bengtssonsbageri.se")).toBe("••••@••••.se");
  });

  it("behåller en allmän e-posttjänst", () => {
    expect(sanitizeOutbound("kund@gmail.com")).toBe("••••@gmail.com");
  });
});

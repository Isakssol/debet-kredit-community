import { describe, it, expect } from "vitest";
import { parseCsv, parseCustomersCsv, parseArticlesCsv } from "@/lib/migration/csv";

describe("parseCsv", () => {
  it("hanterar semikolon, citattecken och radbrytningar i fält", () => {
    const rows = parseCsv('Namn;Ort\n"Ab; Cd";Västerås\n"Rad\nbryt";Eskilstuna\n');
    expect(rows).toEqual([["Namn", "Ort"], ["Ab; Cd", "Västerås"], ["Rad\nbryt", "Eskilstuna"]]);
  });
  it("väljer komma när det dominerar", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("hanterar dubbla citattecken (escapade)", () => {
    expect(parseCsv('Namn\n"Bolaget ""AB"""')).toEqual([["Namn"], ['Bolaget "AB"']]);
  });
});

describe("parseCustomersCsv", () => {
  it("mappar Fortnox-rubriker oavsett ordning", () => {
    const csv = "Kundnummer;Organisationsnummer;Namn;Adress 1;Postnummer;Ort;E-post;Telefon\n" +
      "1;556123-4567;Testbolaget AB;Storgatan 1;722 12;Västerås;info@test.se;021-123456\n";
    const { customers, error } = parseCustomersCsv(csv);
    expect(error).toBeUndefined();
    expect(customers).toEqual([{
      name: "Testbolaget AB", org_number: "556123-4567", email: "info@test.se",
      phone: "021-123456", address: "Storgatan 1", postal_code: "722 12", city: "Västerås",
    }]);
  });
  it("hoppar rader utan namn och klarar saknade kolumner", () => {
    const { customers } = parseCustomersCsv("Namn\nKund Ett\n\nKund Två\n");
    expect(customers.map((c) => c.name)).toEqual(["Kund Ett", "Kund Två"]);
    expect(customers[0].email).toBeNull();
  });
  it("felar begripligt utan namnkolumn", () => {
    expect(parseCustomersCsv("Foo;Bar\n1;2").error).toContain("namnkolumn");
  });
});

describe("parseArticlesCsv", () => {
  it("mappar artiklar med svenska decimaler", () => {
    const csv = "Artikelnummer;Benämning;Enhet;Försäljningspris;Moms %\n" +
      "STEG1;Motoroptimering steg 1;st;3776,00;25\nEGR;EGR OFF;st;3120,5;25\n";
    const { articles } = parseArticlesCsv(csv);
    expect(articles).toEqual([
      { article_no: "STEG1", name: "Motoroptimering steg 1", unit: "st", price: 3776, vat_rate: 25 },
      { article_no: "EGR", name: "EGR OFF", unit: "st", price: 3120.5, vat_rate: 25 },
    ]);
  });
  it("genererar artikelnummer och defaultar enhet/moms när kolumner saknas", () => {
    const { articles } = parseArticlesCsv("Benämning\nKonsulttimme\n");
    expect(articles[0]).toEqual({
      article_no: "IMP-1", name: "Konsulttimme", unit: "st", price: 0, vat_rate: 25,
    });
  });
});

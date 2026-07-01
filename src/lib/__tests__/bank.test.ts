import { describe, it, expect } from "vitest";
import { parseBankCsv } from "../bank/csv-parser";
import { suggestMatch } from "../bank/matching";

describe("CSV-parser", () => {
  it("Swedbank-format med metadata-rader", () => {
    const csv = `Kontoutdrag,,,,
"Personkonto","123 456 789-0",,,
Bokföringsdag;Transaktionsdag;Beskrivning;Belopp;Bokfört saldo
2026-06-30;2026-06-30;"HAUS MEDIA AB";15 000,00;45 231,50
2026-06-28;2026-06-28;"Pris Bankgirobetalning";-45,00;30 231,50`;
    const res = parseBankCsv(csv);
    expect(res.bank).toBe("Swedbank");
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0]).toEqual({
      bookingDate: "2026-06-30",
      amount: 15000,
      description: "HAUS MEDIA AB",
      balanceAfter: 45231.5,
    });
    expect(res.transactions[1].amount).toBe(-45);
  });

  it("Nordea-format med punkt-datum", () => {
    const csv = `Bokföringsdag;Belopp;Avsändare;Mottagarnamn;Rubrik;Saldo
30.06.2026;-599,00;;Telia Sverige AB;Autogiro Telia;12 400,00`;
    const res = parseBankCsv(csv);
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].bookingDate).toBe("2026-06-30");
    expect(res.transactions[0].amount).toBe(-599);
    expect(res.transactions[0].description).toContain("Telia");
  });

  it("generiskt format med kommaseparering", () => {
    const csv = `Datum,Text,Belopp
2026-05-12,"Swish inbetalning",2500.00`;
    const res = parseBankCsv(csv);
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].amount).toBe(2500);
  });

  it("okänt format ger varning i stället för skräpdata", () => {
    const res = parseBankCsv("foo;bar\n1;2");
    expect(res.transactions).toHaveLength(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe("matchningsmotorn", () => {
  const invoices = [
    { id: "inv1", invoiceNo: 42, ocr: "4247", customerName: "Haus Media AB", remaining: 15000 },
    { id: "inv2", invoiceNo: 43, ocr: "4353", customerName: "Testkund AB", remaining: 8000 },
  ];
  const supplierInvoices = [
    { id: "sup1", invoiceNo: "F-991", ocr: "99912345", supplierName: "Telia", remaining: 599 },
  ];

  it("OCR i texten + rätt belopp → hög konfidens kundinbetalning", () => {
    const s = suggestMatch(
      { amount: 15000, description: "Insättning OCR 4247", bookingDate: "2026-06-30" },
      invoices, supplierInvoices, []);
    expect(s.kind).toBe("customer_payment");
    if (s.kind === "customer_payment") {
      expect(s.invoiceId).toBe("inv1");
      expect(s.confidence).toBe("high");
    }
  });

  it("unikt belopp utan OCR → medium konfidens", () => {
    const s = suggestMatch(
      { amount: 8000, description: "HAUS MEDIA AB", bookingDate: "2026-06-30" },
      invoices, supplierInvoices, []);
    expect(s.kind).toBe("customer_payment");
    if (s.kind === "customer_payment") expect(s.confidence).toBe("medium");
  });

  it("negativt belopp + leverantörs-OCR → leverantörsbetalning", () => {
    const s = suggestMatch(
      { amount: -599, description: "Autogiro 99912345 Telia", bookingDate: "2026-06-28" },
      invoices, supplierInvoices, []);
    expect(s.kind).toBe("supplier_payment");
  });

  it("redan bokfört verifikat samma belopp/datum → avprickning", () => {
    const s = suggestMatch(
      { amount: -5000, description: "Överföring", bookingDate: "2026-06-15" },
      invoices, supplierInvoices,
      [{ verificationId: "v1", label: "A7", date: "2026-06-14", amount: -5000, description: "Eget uttag" }]);
    expect(s.kind).toBe("already_booked");
  });

  it("Skatteverket → F-skatteförslag", () => {
    const s = suggestMatch(
      { amount: -4200, description: "Skatteverket skattekonto", bookingDate: "2026-06-12" },
      invoices, supplierInvoices, []);
    expect(s.kind).toBe("quick_event");
    if (s.kind === "quick_event") expect(s.event).toBe("fskatt");
  });

  it("bankavgift känns igen", () => {
    const s = suggestMatch(
      { amount: -45, description: "Pris Bankgirobetalning", bookingDate: "2026-06-28" },
      invoices, supplierInvoices, []);
    expect(s.kind).toBe("quick_event");
    if (s.kind === "quick_event") expect(s.event).toBe("bankavgift");
  });

  it("okänd transaktion → manuell hantering", () => {
    const s = suggestMatch(
      { amount: -1234.56, description: "KLARNA*WEBBSHOP", bookingDate: "2026-06-20" },
      invoices, supplierInvoices, []);
    expect(s.kind).toBe("unknown");
  });
});

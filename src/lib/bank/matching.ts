/**
 * Matchningsmotorn: föreslår vad varje banktransaktion är.
 * Prioritetsordning (Fortnox-mönstret):
 *  1. OCR/fakturanummer i texten + belopp → kundinbetalning
 *  2. Belopp = öppen kundfaktura → kundinbetalning
 *  3. Belopp = öppen leverantörsfaktura (negativt) → leverantörsbetalning
 *  4. Redan bokfört verifikat samma dag/belopp → avprickning (ingen dubbelbokning)
 *  5. Kända motparter (Skatteverket, bankavgift...) → snabbhändelseförslag
 */

export type OpenInvoice = {
  id: string;
  invoiceNo: number | null;
  ocr: string | null;
  customerName: string;
  remaining: number;
};

export type OpenSupplierInvoice = {
  id: string;
  invoiceNo: string | null;
  ocr: string | null;
  supplierName: string;
  remaining: number;
};

export type BookedCandidate = {
  verificationId: string;
  label: string;
  date: string;
  amount: number; // nettoförändring på bankkonto (1930): positiv = debet
  description: string;
};

export type MatchSuggestion =
  | { kind: "customer_payment"; invoiceId: string; label: string; confidence: "high" | "medium" }
  | { kind: "supplier_payment"; supplierInvoiceId: string; label: string; confidence: "high" | "medium" }
  | { kind: "already_booked"; verificationId: string; label: string; confidence: "high" | "medium" }
  | { kind: "quick_event"; event: "fskatt" | "uttag" | "insattning" | "bankavgift" | "moms"; label: string; confidence: "medium" }
  | { kind: "unknown"; label: string };

export function suggestMatch(
  tx: { amount: number; description: string; bookingDate: string },
  openInvoices: OpenInvoice[],
  openSupplierInvoices: OpenSupplierInvoice[],
  bookedCandidates: BookedCandidate[]
): MatchSuggestion {
  const text = tx.description.toLowerCase();
  const digits = tx.description.replace(/\D/g, " ");

  // 4 först: redan bokfört (avprickning) — exakt belopp + nära datum
  const booked = bookedCandidates.find(
    (b) => Math.abs(b.amount - tx.amount) < 0.005
      && Math.abs(new Date(b.date).getTime() - new Date(tx.bookingDate).getTime()) <= 5 * 86400000
  );

  if (tx.amount > 0) {
    // 1. OCR eller fakturanummer i transaktionstexten
    for (const inv of openInvoices) {
      const ocrHit = inv.ocr && digits.includes(inv.ocr);
      const noHit = inv.invoiceNo != null
        && new RegExp(`\\b${inv.invoiceNo}\\b`).test(digits);
      if ((ocrHit || noHit) && Math.abs(inv.remaining - tx.amount) < 0.005) {
        return {
          kind: "customer_payment",
          invoiceId: inv.id,
          label: `Inbetalning faktura ${inv.invoiceNo} — ${inv.customerName}`,
          confidence: "high",
        };
      }
    }
    // 2. Exakt belopp mot en enda öppen faktura
    const amountHits = openInvoices.filter((i) => Math.abs(i.remaining - tx.amount) < 0.005);
    if (amountHits.length === 1) {
      return {
        kind: "customer_payment",
        invoiceId: amountHits[0].id,
        label: `Inbetalning faktura ${amountHits[0].invoiceNo} — ${amountHits[0].customerName}`,
        confidence: "medium",
      };
    }
  } else if (tx.amount < 0) {
    // 3. Leverantörsbetalning: belopp + ev. OCR
    const abs = -tx.amount;
    for (const inv of openSupplierInvoices) {
      const ocrHit = inv.ocr && digits.includes(inv.ocr);
      if (ocrHit && Math.abs(inv.remaining - abs) < 0.005) {
        return {
          kind: "supplier_payment",
          supplierInvoiceId: inv.id,
          label: `Betalning ${inv.supplierName}${inv.invoiceNo ? ` faktura ${inv.invoiceNo}` : ""}`,
          confidence: "high",
        };
      }
    }
    const amountHits = openSupplierInvoices.filter((i) => Math.abs(i.remaining - abs) < 0.005);
    if (amountHits.length === 1) {
      return {
        kind: "supplier_payment",
        supplierInvoiceId: amountHits[0].id,
        label: `Betalning ${amountHits[0].supplierName}`,
        confidence: "medium",
      };
    }
  }

  if (booked) {
    return {
      kind: "already_booked",
      verificationId: booked.verificationId,
      label: `Redan bokförd som ${booked.label}: ${booked.description}`,
      confidence: "high",
    };
  }

  // 5. Kända motparter
  if (text.includes("skatteverket") || text.includes("skattekonto")) {
    return {
      kind: "quick_event",
      event: tx.amount < 0 ? "fskatt" : "moms",
      label: tx.amount < 0 ? "F-skatt/skatteinbetalning (D 2012)" : "Utbetalning från Skatteverket",
      confidence: "medium",
    };
  }
  if (text.includes("pris") && text.includes("bank") || text.includes("bankavgift")
      || text.includes("kortavgift") || text.includes("årsavgift")) {
    return {
      kind: "quick_event",
      event: "bankavgift",
      label: "Bankkostnad (D 6570, momsfri)",
      confidence: "medium",
    };
  }
  if (text.includes("eget uttag") || text.includes("överföring") && tx.amount < 0) {
    return {
      kind: "quick_event",
      event: "uttag",
      label: "Eget uttag (D 2013)?",
      confidence: "medium",
    };
  }
  if (text.includes("insättning") || (text.includes("överföring") && tx.amount > 0)) {
    return {
      kind: "quick_event",
      event: "insattning",
      label: "Egen insättning (K 2018)?",
      confidence: "medium",
    };
  }

  return { kind: "unknown", label: "Ingen automatisk matchning — bokför manuellt" };
}

/**
 * Bokföringen av en kundfaktura — EN väg, precis som utkastet har en.
 *
 * Modulen är utbruten ur `bookInvoice()` i `src/lib/actions/invoices.ts` av
 * exakt samma skäl som `writeInvoiceDraft` bröts ut ur `saveInvoiceDraft`:
 * fakturan bokförs nu från två håll med olika sätt att bevisa vem som frågar.
 *
 *   fakturaknappen  ─► bookInvoice()                inloggad cookie-session
 *   API:et          ─► POST /api/v1/kundfakturor    dk_live_-nyckel + ledger:write
 *
 * Den tar emot sin Supabase-klient av anroparen och gör INGEN
 * behörighetskontroll — den ligger hos den som anropar, och i databasen.
 *
 * HÅRD REGEL 1, I PRAKTIKEN. De tre stegen är oförändrade och går genom
 * motorns egna vägar:
 *
 *   1. `assign_invoice_no()` — security definer, ett obrutet nummer.
 *   2. `book_verification()` — security definer, och det är HÄR spärrarna
 *      sitter: avslutat räkenskapsår, periodlås, balanskravet, att kontot
 *      finns och är aktivt, och den obrutna verifikationsserien.
 *   3. En UPDATE på `invoices` som sätter nummer, OCR, kundsnapshot och
 *      verifikatets id.
 *
 * Steg 3 är en vanlig skrivning och passerar därför RLS och
 * `invoices_guard_update()` — samma trigger som fryser en bokförd fakturas
 * innehåll för gränssnittet. Det är också skälet till att `invoices` är öppen
 * för UPDATE med `ledger:write` i 20260908000005, till skillnad från
 * licensutgåvan där hela bokföringen ligger i en enda security
 * definer-funktion. Skillnaden står utskriven i migrationen.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { generateOcr } from "@/lib/ocr";
import {
  calculateTotals, invoicePostingRows, type InvoiceRowInput,
} from "@/lib/invoicing/totals";

type InvoiceRowRecord = {
  row_no: number; article_id: string | null; description: string;
  quantity: number; unit: string; unit_price: number; discount_pct: number;
  vat_rate: number; account: number | null; is_text_row: boolean;
};

export type BookResult =
  | { error: string }
  | { ok: true; invoiceNo: number; ocr: string | null };

export async function bookInvoiceWith(
  supabase: SupabaseClient,
  id: string
): Promise<BookResult> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customers(*), invoice_rows(*)")
    .eq("id", id).single();
  if (!invoice) return { error: "Fakturan finns inte." };
  if (invoice.status !== "draft") return { error: "Fakturan är redan bokförd." };

  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .lte("start_date", invoice.invoice_date).gte("end_date", invoice.invoice_date).single();
  if (!fy) return { error: "Inget räkenskapsår för fakturadatumet." };

  const { data: invoiceNo, error: noErr } = await supabase.rpc("assign_invoice_no");
  if (noErr || invoiceNo == null) {
    return { error: noErr?.message ?? "Kunde inte tilldela fakturanummer." };
  }
  const ocr = generateOcr(invoiceNo as number);

  const customer = invoice.customers!;
  const snapshot = {
    name: customer.name,
    org_number: customer.org_number,
    vat_number: customer.vat_number,
    address: customer.address,
    postal_code: customer.postal_code,
    city: customer.city,
    country: customer.country,
    email: customer.email,
  };

  let verificationId: string | null = null;
  if (fy.accounting_method === "faktureringsmetoden") {
    const applyVat = invoice.vat_type === "SE";
    const rowInputs: InvoiceRowInput[] = ((invoice.invoice_rows ?? []) as InvoiceRowRecord[]).map((r) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unit_price),
      discountPct: Number(r.discount_pct),
      vatRate: Number(r.vat_rate),
      account: r.account ?? 3011,
      isTextRow: r.is_text_row,
    }));
    const totals = calculateTotals(rowInputs, applyVat);
    const posting = invoicePostingRows(rowInputs, totals, applyVat);
    const { data: ver, error: verErr } = await supabase.rpc("book_verification", {
      p_series_code: "B",
      p_date: invoice.invoice_date,
      p_description: `Kundfaktura ${invoiceNo} — ${customer.name}`,
      p_rows: posting,
      p_counterparty: customer.name,
      p_source: "customer_invoice",
    });
    if (verErr) return { error: verErr.message };
    verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;
  }

  const { error } = await supabase.from("invoices").update({
    invoice_no: invoiceNo,
    ocr,
    status: "booked",
    customer_snapshot: snapshot,
    verification_id: verificationId,
  }).eq("id", id);
  if (error) return { error: error.message };

  return { ok: true, invoiceNo: invoiceNo as number, ocr };
}

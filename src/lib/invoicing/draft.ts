/**
 * Fakturautkastet — EN väg, oavsett vem som frågar.
 *
 * Modulen är utbruten ur `saveInvoiceDraft()` i `src/lib/actions/invoices.ts`
 * därför att utkastet nu skrivs från två håll med olika sätt att bevisa vem
 * som frågar:
 *
 *   fakturaformuläret ─► saveInvoiceDraft()             inloggad cookie-session
 *   API:et            ─► POST /api/v1/kundfakturor      dk_live_-nyckel + ledger:write
 *
 * Den tar emot sin Supabase-klient av anroparen och gör INGEN
 * behörighetskontroll — den ligger hos den som anropar, och i databasen.
 *
 * VARFÖR INTE LÅTA API:ET ANROPA SERVER-ACTIONEN. Actionen skapar sin egen
 * cookie-klient. Ett API-anrop har ingen cookie, så `auth.uid()` hade varit
 * null, spärrarna hade räknat anroparen som betrodd och skrivningen hade skett
 * helt utanför nyckelns scope. Att i stället lägga en valfri klient-parameter
 * på actionen hade gjort dess behörighetskontroll förbiglig utifrån — samma
 * fälla, en våning upp.
 *
 * DET SOM INTE ÄNDRAS AV UTBRYTNINGEN. Prövningen av raderna, momssatserna
 * och totalsumman är ordagrant densamma, och fakturanumret sätts fortfarande
 * först vid bokföring.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { calculateTotals, type InvoiceRowInput } from "@/lib/invoicing/totals";
import { addDays } from "@/lib/dates";

export const invoiceRowSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountPct: z.number().min(0).max(100).default(0),
  // Endast 25, 12, 6 och 0 procent är giltiga svenska momssatser (9 kap.
  // mervärdesskattelagen [2023:200]; Skatteverket, "Fylla i momsdeklarationen",
  // fält 10/11/12). En annan sats skulle debiteras kunden utan att kunna
  // bokföras — invoicePostingRows har inget momskonto för den.
  vatRate: z.number().refine((v) => [0, 6, 12, 25].includes(v), "Momssatsen måste vara 25, 12, 6 eller 0 procent."),
  account: z.number().int(),
  articleId: z.string().nullable().optional(),
  unit: z.string().default("st"),
  isTextRow: z.boolean().default(false),
});

export const invoiceDraftSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentTerms: z.number().int().min(0).max(90),
  yourReference: z.string().optional(),
  notes: z.string().optional(),
  rows: z.array(invoiceRowSchema).min(1),
});

export type DraftResult = { error: string } | { ok: true; invoiceId: string };

/**
 * Skriver ett fakturautkast och dess rader.
 *
 * @param id null skapar en ny faktura; ett id skriver om ett befintligt
 *   utkast. API:et skickar alltid null — det skapar fakturor, det ändrar dem
 *   inte, och `invoices` är därför inte öppen för UPDATE av utkast utifrån
 *   annat än bokföringssteget.
 */
export async function writeInvoiceDraft(
  supabase: SupabaseClient,
  id: string | null,
  input: unknown
): Promise<DraftResult> {
  const parsed = invoiceDraftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { customerId, invoiceDate, paymentTerms, yourReference, notes, rows } = parsed.data;

  const { data: customer } = await supabase
    .from("customers").select("*").eq("id", customerId).single();
  if (!customer) return { error: "Kunden finns inte." };

  const applyVat = customer.vat_type === "SE";
  const totals = calculateTotals(rows as InvoiceRowInput[], applyVat);
  if (totals.total < 0) {
    return { error: "Fakturans totalsumma kan inte vara negativ — skapa kreditfaktura i stället." };
  }

  const invoiceValues = {
    customer_id: customerId,
    invoice_date: invoiceDate,
    due_date: addDays(invoiceDate, paymentTerms),
    payment_terms: paymentTerms,
    your_reference: yourReference || null,
    notes: notes || null,
    vat_type: customer.vat_type,
    net_amount: totals.net,
    vat_amount: totals.vat,
    rounding: totals.rounding,
    total_amount: totals.total,
  };

  let invoiceId = id;
  if (id) {
    const { error } = await supabase.from("invoices").update(invoiceValues).eq("id", id).eq("status", "draft");
    if (error) return { error: error.message };
    await supabase.from("invoice_rows").delete().eq("invoice_id", id);
  } else {
    const { data, error } = await supabase.from("invoices").insert(invoiceValues).select("id").single();
    if (error) return { error: error.message };
    invoiceId = data.id;
  }

  const { error: rowErr } = await supabase.from("invoice_rows").insert(
    rows.map((r, i) => ({
      invoice_id: invoiceId,
      row_no: i + 1,
      article_id: r.articleId ?? null,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      unit_price: r.unitPrice,
      discount_pct: r.discountPct,
      vat_rate: applyVat ? r.vatRate : 0,
      account: r.account,
      is_text_row: r.isTextRow,
    }))
  );
  if (rowErr) return { error: rowErr.message };

  return { ok: true, invoiceId: invoiceId! };
}

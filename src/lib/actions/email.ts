"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Skicka faktura via e-post (Resend). Kräver RESEND_API_KEY i miljön och
 * verifierad avsändardomän hos resend.com.
 */
export async function sendInvoiceEmail(invoiceId: string) {
  if (!process.env.RESEND_API_KEY) {
    return {
      error: "E-post är inte konfigurerat ännu — lägg till RESEND_API_KEY i .env.local " +
        "(skapa konto på resend.com och verifiera din avsändardomän). " +
        "Tills dess: öppna PDF:en och mejla den själv.",
    };
  }

  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices")
    .select("*, customers(name, email)").eq("id", invoiceId).single();
  if (!inv) return { error: "Fakturan finns inte." };
  if (inv.status === "draft") return { error: "Bokför fakturan först." };

  const email = (inv.customer_snapshot as { email?: string })?.email ?? inv.customers?.email;
  if (!email) return { error: "Kunden saknar e-postadress." };

  const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).single();

  // Rendera faktura-PDF:en direkt (samma dataväg som PDF-routen)
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const React = await import("react");
  const { InvoicePdf } = await import("@/lib/invoicing/invoice-pdf");
  const { calculateTotals } = await import("@/lib/invoicing/totals");

  const { data: fullInv } = await supabase.from("invoices")
    .select("*, customers(*), invoice_rows(*), credits:credits_invoice_id(invoice_no)")
    .eq("id", invoiceId).single();
  if (!fullInv || !settings) return { error: "Kunde inte läsa fakturan." };

  const rowInputs = (fullInv.invoice_rows ?? [])
    .sort((a: { row_no: number }, b: { row_no: number }) => a.row_no - b.row_no)
    .map((r: { description: string; quantity: number; unit_price: number; discount_pct: number; vat_rate: number; unit: string; is_text_row: boolean; account: number | null }) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unit_price),
      discountPct: Number(r.discount_pct),
      vatRate: Number(r.vat_rate),
      unit: r.unit,
      isTextRow: r.is_text_row,
      account: r.account ?? 3011,
    }));
  const totals = calculateTotals(rowInputs, fullInv.vat_type === "SE");

  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoicePdf, {
      data: {
        type: fullInv.type as "debit" | "credit",
        invoiceNo: fullInv.invoice_no!,
        ocr: fullInv.ocr ?? "",
        invoiceDate: fullInv.invoice_date,
        dueDate: fullInv.due_date,
        paymentTerms: fullInv.payment_terms,
        creditsInvoiceNo: (fullInv.credits as { invoice_no: number } | null)?.invoice_no ?? null,
        vatType: fullInv.vat_type as "SE" | "EU_REVERSE" | "EXPORT",
        customer: (fullInv.customer_snapshot ?? fullInv.customers) as never,
        yourReference: fullInv.your_reference,
        ourReference: settings.company_name,
        notes: fullInv.notes,
        rows: rowInputs,
        vatGroups: totals.vatGroups,
        net: Number(fullInv.net_amount),
        vat: Number(fullInv.vat_amount),
        rounding: Number(fullInv.rounding),
        total: Number(fullInv.total_amount),
        company: settings,
      },
    }) as never
  );

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.INVOICE_FROM_EMAIL ?? `faktura@${(settings.email ?? "example.com").split("@")[1]}`;
  const label = fullInv.type === "credit" ? "Kreditfaktura" : "Faktura";

  const { error } = await resend.emails.send({
    from: `${settings.company_name} <${from}>`,
    to: email,
    subject: `${label} ${fullInv.invoice_no} från ${settings.company_name}`,
    text: `Hej!\n\nBifogat finner ni ${label.toLowerCase()} ${fullInv.invoice_no}.\n` +
      (fullInv.type === "debit"
        ? `Belopp: ${Number(fullInv.total_amount).toLocaleString("sv-SE")} kr\nFörfallodatum: ${fullInv.due_date}\nOCR: ${fullInv.ocr}\n${settings.bankgiro ? `Bankgiro: ${settings.bankgiro}` : ""}\n`
        : "") +
      `\nMed vänlig hälsning\n${settings.company_name}`,
    attachments: [{
      filename: `${label.toLowerCase()}-${fullInv.invoice_no}.pdf`,
      content: Buffer.from(pdfBuffer).toString("base64"),
    }],
  });
  if (error) return { error: `E-postfel: ${error.message}` };

  await supabase.from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoiceId).eq("status", "booked");

  revalidatePath(`/fakturor/${invoiceId}`);
  return { ok: true, email };
}

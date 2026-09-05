import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { calculateTotals, type InvoiceRowInput } from "@/lib/invoicing/totals";
import { InvoicePdf, type InvoicePdfData } from "@/lib/invoicing/invoice-pdf";
import { logoDataUrl } from "@/lib/branding/logo";
import React from "react";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase.from("invoices")
      .select("*, customers(*), invoice_rows(*), credits:credits_invoice_id(invoice_no)")
      .eq("id", id).single(),
    supabase.from("settings").select("*").eq("id", 1).single(),
  ]);

  if (!invoice || !settings) {
    return NextResponse.json({ error: "Fakturan finns inte." }, { status: 404 });
  }
  if (invoice.status === "draft" || !invoice.invoice_no) {
    return NextResponse.json({ error: "Bokför fakturan innan PDF skapas." }, { status: 400 });
  }

  const snapshot = (invoice.customer_snapshot ?? invoice.customers) as InvoicePdfData["customer"];
  const applyVat = invoice.vat_type === "SE";
  type RowRecord = {
    row_no: number; description: string; quantity: number; unit_price: number;
    discount_pct: number; vat_rate: number; unit: string; is_text_row: boolean;
    account: number | null;
  };
  const rows = ((invoice.invoice_rows ?? []) as RowRecord[])
    .sort((a, b) => a.row_no - b.row_no)
    .map((r) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unit_price),
      discountPct: Number(r.discount_pct),
      vatRate: Number(r.vat_rate),
      unit: r.unit,
      isTextRow: r.is_text_row,
      account: r.account ?? 3011,
    }));
  const totals = calculateTotals(rows as InvoiceRowInput[], applyVat);

  // Egen logotyp i fakturahuvudet. Saknas den blir det företagsnamnet som förut.
  const logo = await logoDataUrl(supabase, settings.logo_path);

  const data: InvoicePdfData = {
    type: invoice.type as "debit" | "credit",
    invoiceNo: invoice.invoice_no,
    ocr: invoice.ocr ?? "",
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    paymentTerms: invoice.payment_terms,
    creditsInvoiceNo: (invoice.credits as { invoice_no: number } | null)?.invoice_no ?? null,
    vatType: invoice.vat_type as InvoicePdfData["vatType"],
    customer: snapshot,
    yourReference: invoice.your_reference,
    ourReference: invoice.our_reference ?? settings.company_name,
    notes: invoice.notes,
    rows,
    vatGroups: totals.vatGroups,
    net: Number(invoice.net_amount),
    vat: Number(invoice.vat_amount),
    rounding: Number(invoice.rounding),
    total: Number(invoice.total_amount),
    company: settings,
    logoDataUrl: logo,
  };

  const buffer = await renderToBuffer(
    React.createElement(InvoicePdf, { data }) as unknown as React.ReactElement<DocumentProps>
  );
  const label = invoice.type === "credit" ? "kreditfaktura" : "faktura";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${label}-${invoice.invoice_no}.pdf"`,
    },
  });
}

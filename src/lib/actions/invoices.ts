"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateOcr } from "@/lib/ocr";
import {
  calculateTotals, invoicePostingRows, type InvoiceRowInput,
} from "@/lib/invoicing/totals";
import { z } from "zod";

type InvoiceRowRecord = {
  row_no: number; article_id: string | null; description: string;
  quantity: number; unit: string; unit_price: number; discount_pct: number;
  vat_rate: number; account: number | null; is_text_row: boolean;
};

const rowSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountPct: z.number().min(0).max(100).default(0),
  vatRate: z.number(),
  account: z.number().int(),
  articleId: z.string().nullable().optional(),
  unit: z.string().default("st"),
  isTextRow: z.boolean().default(false),
});

const draftSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentTerms: z.number().int().min(0).max(90),
  yourReference: z.string().optional(),
  notes: z.string().optional(),
  rows: z.array(rowSchema).min(1),
});

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Skapa/uppdatera fakturautkast. Fakturanummer sätts först vid bokföring. */
export async function saveInvoiceDraft(id: string | null, input: unknown) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { customerId, invoiceDate, paymentTerms, yourReference, notes, rows } = parsed.data;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers").select("*").eq("id", customerId).single();
  if (!customer) return { error: "Kunden finns inte." };

  const applyVat = customer.vat_type === "SE";
  const totals = calculateTotals(rows as InvoiceRowInput[], applyVat);
  if (totals.total < 0) return { error: "Fakturans totalsumma kan inte vara negativ — skapa kreditfaktura i stället." };

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

  revalidatePath("/fakturor");
  return { ok: true, invoiceId };
}

/**
 * Bokför faktura: tilldelar fakturanummer + OCR, fryser kunduppgifter.
 * Faktureringsmetoden: skapar verifikat (D 1510 / K 3xxx / K 26xx) i serie B.
 * Kontantmetoden: inget verifikat förrän betalning.
 */
export async function bookInvoice(id: string) {
  const supabase = await createClient();
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
  if (noErr || invoiceNo == null) return { error: noErr?.message ?? "Kunde inte tilldela fakturanummer." };
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

  revalidatePath("/fakturor");
  revalidatePath(`/fakturor/${id}`);
  return { ok: true, invoiceNo, ocr };
}

/** Registrera betalning (även delbetalning). */
export async function registerPayment(input: {
  invoiceId: string;
  paymentDate: string;
  amount: number;
}) {
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices").select("*, invoice_rows(*), invoice_payments(amount)")
    .eq("id", input.invoiceId).single();
  if (!invoice) return { error: "Fakturan finns inte." };
  if (invoice.status === "draft") return { error: "Bokför fakturan först." };
  if (input.amount <= 0) return { error: "Beloppet måste vara positivt." };

  const paid = ((invoice.invoice_payments ?? []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(invoice.total_amount) - paid;
  if (input.amount > remaining + 0.005) {
    return { error: `Beloppet överstiger kvarvarande ${remaining.toFixed(2)} kr.` };
  }

  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .lte("start_date", input.paymentDate).gte("end_date", input.paymentDate).single();
  if (!fy) return { error: "Inget räkenskapsår för betaldatumet." };

  let posting: { account: number; debit: number; credit: number; note?: string }[];
  if (fy.accounting_method === "faktureringsmetoden") {
    posting = [
      { account: 1930, debit: input.amount, credit: 0 },
      { account: 1510, debit: 0, credit: input.amount, note: `Faktura ${invoice.invoice_no}` },
    ];
  } else {
    // Kontantmetoden: intäkt + moms bokförs proportionellt vid betalning
    const share = input.amount / Number(invoice.total_amount);
    posting = [{ account: 1930, debit: input.amount, credit: 0 }];
    const applyVat = invoice.vat_type === "SE";
    const rowInputs: InvoiceRowInput[] = ((invoice.invoice_rows ?? []) as InvoiceRowRecord[]).map((r) => ({
      description: r.description, quantity: Number(r.quantity), unitPrice: Number(r.unit_price),
      discountPct: Number(r.discount_pct), vatRate: Number(r.vat_rate),
      account: r.account ?? 3011, isTextRow: r.is_text_row,
    }));
    const totals = calculateTotals(rowInputs, applyVat);
    const base = invoicePostingRows(rowInputs, totals, applyVat).filter((p) => p.account !== 1510);
    let creditSum = 0;
    for (const p of base) {
      const credit = Math.round(p.credit * share * 100) / 100;
      const debit = Math.round(p.debit * share * 100) / 100;
      creditSum += credit - debit;
      if (credit > 0 || debit > 0) posting.push({ ...p, credit, debit });
    }
    // Justera öresdiff mot första intäktsraden
    const diff = Math.round((input.amount - creditSum) * 100) / 100;
    if (Math.abs(diff) >= 0.01) {
      const rev = posting.find((p) => p.credit > 0 && p.account >= 3000);
      if (rev) rev.credit = Math.round((rev.credit + diff) * 100) / 100;
    }
  }

  const { data: ver, error: verErr } = await supabase.rpc("book_verification", {
    p_series_code: "B",
    p_date: input.paymentDate,
    p_description: `Inbetalning faktura ${invoice.invoice_no}`,
    p_rows: posting,
    p_counterparty: (invoice.customer_snapshot as { name?: string })?.name,
    p_source: "customer_payment",
  });
  if (verErr) return { error: verErr.message };
  const verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;

  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id: input.invoiceId,
    payment_date: input.paymentDate,
    amount: input.amount,
    verification_id: verificationId,
  });
  if (error) return { error: error.message };

  const newPaid = paid + input.amount;
  const newStatus = newPaid >= Number(invoice.total_amount) - 0.005 ? "paid" : "partially_paid";
  await supabase.from("invoices").update({ status: newStatus }).eq("id", input.invoiceId);

  revalidatePath("/fakturor");
  revalidatePath(`/fakturor/${input.invoiceId}`);
  return { ok: true };
}

/** Kreditfaktura: speglar originalet, bokför omvänt verifikat, kvittas mot originalet. */
export async function createCreditInvoice(originalId: string) {
  const supabase = await createClient();
  const { data: original } = await supabase
    .from("invoices").select("*, invoice_rows(*)").eq("id", originalId).single();
  if (!original) return { error: "Originalfakturan finns inte." };
  if (original.status === "draft") return { error: "Fakturan är inte bokförd." };
  if (original.type === "credit") return { error: "Kan inte kreditera en kreditfaktura." };
  if (original.status === "credited") return { error: "Fakturan är redan krediterad." };

  const today = new Date().toISOString().slice(0, 10);
  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .lte("start_date", today).gte("end_date", today).single();
  if (!fy) return { error: "Inget öppet räkenskapsår." };

  const { data: invoiceNo, error: noErr } = await supabase.rpc("assign_invoice_no");
  if (noErr || invoiceNo == null) return { error: noErr?.message ?? "Numreringsfel." };

  let verificationId: string | null = null;
  if (fy.accounting_method === "faktureringsmetoden" && original.verification_id) {
    // Vänd originalets kontering
    const { data: origRows } = await supabase.from("verification_rows")
      .select("account, debit, credit").eq("verification_id", original.verification_id);
    const posting = (origRows ?? []).map((r) => ({
      account: r.account, debit: Number(r.credit), credit: Number(r.debit),
    }));
    const { data: ver, error: verErr } = await supabase.rpc("book_verification", {
      p_series_code: "B",
      p_date: today,
      p_description: `Kreditfaktura ${invoiceNo} (krediterar ${original.invoice_no})`,
      p_rows: posting,
      p_counterparty: (original.customer_snapshot as { name?: string })?.name,
      p_source: "customer_invoice",
    });
    if (verErr) return { error: verErr.message };
    verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;
  }

  const { data: credit, error } = await supabase.from("invoices").insert({
    invoice_no: invoiceNo,
    ocr: generateOcr(invoiceNo as number),
    type: "credit",
    status: "booked",
    customer_id: original.customer_id,
    customer_snapshot: original.customer_snapshot,
    invoice_date: today,
    due_date: today,
    payment_terms: 0,
    vat_type: original.vat_type,
    credits_invoice_id: originalId,
    verification_id: verificationId,
    net_amount: -Number(original.net_amount),
    vat_amount: -Number(original.vat_amount),
    rounding: -Number(original.rounding),
    total_amount: -Number(original.total_amount),
    notes: `Kreditering av faktura ${original.invoice_no}`,
  }).select("id").single();
  if (error) return { error: error.message };

  await supabase.from("invoice_rows").insert(
    ((original.invoice_rows ?? []) as InvoiceRowRecord[]).map((r) => ({
      invoice_id: credit.id,
      row_no: r.row_no,
      article_id: r.article_id,
      description: r.description,
      quantity: -Number(r.quantity),
      unit: r.unit,
      unit_price: Number(r.unit_price),
      discount_pct: Number(r.discount_pct),
      vat_rate: Number(r.vat_rate),
      account: r.account,
      is_text_row: r.is_text_row,
    }))
  );

  await supabase.from("invoices").update({ status: "credited" }).eq("id", originalId);
  revalidatePath("/fakturor");
  return { ok: true, creditInvoiceId: credit.id, invoiceNo };
}

export async function markInvoiceSent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id).eq("status", "booked");
  if (error) return { error: error.message };
  revalidatePath(`/fakturor/${id}`);
  return { ok: true };
}

export async function createReminder(invoiceId: string, fee: number) {
  const supabase = await createClient();
  const { data: prev } = await supabase.from("invoice_reminders")
    .select("reminder_no").eq("invoice_id", invoiceId)
    .order("reminder_no", { ascending: false }).limit(1);
  const reminderNo = (prev?.[0]?.reminder_no ?? 0) + 1;
  const { error } = await supabase.from("invoice_reminders").insert({
    invoice_id: invoiceId,
    reminder_no: reminderNo,
    fee,
  });
  if (error) return { error: error.message };
  revalidatePath(`/fakturor/${invoiceId}`);
  return { ok: true, reminderNo };
}

export async function deleteDraft(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id).eq("status", "draft");
  if (error) return { error: error.message };
  revalidatePath("/fakturor");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateTotals, type InvoiceRowInput } from "@/lib/invoicing/totals";
import { saveInvoiceDraft } from "@/lib/actions/invoices";
import { z } from "zod";

/* ---------- Offerter ---------- */

const quoteRowSchema = z.object({
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

const quoteSchema = z.object({
  customerId: z.string().uuid(),
  quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  yourReference: z.string().optional(),
  notes: z.string().optional(),
  rows: z.array(quoteRowSchema).min(1),
});

/** Skapa/uppdatera offert (utkast och skickade kan redigeras tills de accepteras) */
export async function saveQuote(id: string | null, input: unknown): Promise<{
  ok?: boolean; error?: string; quoteId?: string;
}> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { customerId, quoteDate, validUntil, yourReference, notes, rows } = parsed.data;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers").select("vat_type").eq("id", customerId).single();
  if (!customer) return { error: "Kunden finns inte." };

  const applyVat = customer.vat_type === "SE";
  const totals = calculateTotals(rows as InvoiceRowInput[], applyVat);

  const values = {
    customer_id: customerId,
    quote_date: quoteDate,
    valid_until: validUntil,
    your_reference: yourReference || null,
    notes: notes || null,
    net_amount: totals.net,
    vat_amount: totals.vat,
    total_amount: totals.total,
    updated_at: new Date().toISOString(),
  };

  let quoteId = id;
  if (id) {
    const { error } = await supabase.from("quotes").update(values)
      .eq("id", id).in("status", ["draft", "sent"]);
    if (error) return { error: error.message };
    await supabase.from("quote_rows").delete().eq("quote_id", id);
  } else {
    const { data, error } = await supabase.from("quotes").insert(values).select("id").single();
    if (error) return { error: error.message };
    quoteId = data.id;
  }

  const { error: rowErr } = await supabase.from("quote_rows").insert(
    rows.map((r, i) => ({
      quote_id: quoteId,
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

  revalidatePath("/offerter");
  return { ok: true, quoteId: quoteId! };
}

/** Statusövergångar: sent → accepted (blir order med ordernummer) / declined / expired */
export async function setQuoteStatus(
  id: string,
  status: "sent" | "accepted" | "declined" | "expired"
): Promise<{ ok?: boolean; error?: string; orderNo?: number }> {
  const supabase = await createClient();
  const { data: quote } = await supabase.from("quotes")
    .select("status, order_no").eq("id", id).single();
  if (!quote) return { error: "Offerten finns inte." };
  if (["invoiced"].includes(quote.status)) return { error: "Offerten är redan fakturerad." };

  const values: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "accepted" && !quote.order_no) {
    const { data: maxRow } = await supabase.from("quotes")
      .select("order_no").not("order_no", "is", null)
      .order("order_no", { ascending: false }).limit(1).maybeSingle();
    values.order_no = (maxRow?.order_no ?? 0) + 1;
    values.accepted_at = new Date().toISOString();
  }
  const { error } = await supabase.from("quotes").update(values).eq("id", id);
  if (error) return { error: error.message };

  // Vunnen offert flyttar kopplad affär i pipelinen
  if (status === "accepted") {
    await supabase.from("deals").update({ stage: "won", updated_at: new Date().toISOString() })
      .eq("quote_id", id).neq("stage", "won");
  }
  if (status === "declined") {
    await supabase.from("deals").update({ stage: "lost", updated_at: new Date().toISOString() })
      .eq("quote_id", id).in("stage", ["lead", "contacted", "quoted"]);
  }

  revalidatePath("/offerter");
  revalidatePath("/pipeline");
  return { ok: true, orderNo: (values.order_no as number) ?? quote.order_no ?? undefined };
}

/** Gör faktura av accepterad offert (fakturautkast — bokförs som vanligt) */
export async function convertQuoteToInvoice(id: string): Promise<{
  ok?: boolean; error?: string; invoiceId?: string;
}> {
  const supabase = await createClient();
  const { data: quote } = await supabase.from("quotes")
    .select("*, quote_rows(*)").eq("id", id).single();
  if (!quote) return { error: "Offerten finns inte." };
  if (quote.status !== "accepted") return { error: "Endast accepterade offerter (ordrar) kan faktureras." };

  const { data: settings } = await supabase.from("settings")
    .select("default_payment_terms").eq("id", 1).single();

  const rows = (quote.quote_rows as {
    row_no: number; article_id: string | null; description: string; quantity: number;
    unit: string; unit_price: number; discount_pct: number; vat_rate: number;
    account: number | null; is_text_row: boolean;
  }[]).sort((a, b) => a.row_no - b.row_no);

  const res = await saveInvoiceDraft(null, {
    customerId: quote.customer_id,
    invoiceDate: new Date().toISOString().slice(0, 10),
    paymentTerms: settings?.default_payment_terms ?? 30,
    yourReference: quote.your_reference ?? undefined,
    notes: quote.order_no ? `Order ${quote.order_no} (offert ${quote.quote_no})` : `Offert ${quote.quote_no}`,
    rows: rows.map((r) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unit_price),
      discountPct: Number(r.discount_pct),
      vatRate: Number(r.vat_rate),
      account: r.account ?? 3011,
      articleId: r.article_id,
      unit: r.unit,
      isTextRow: r.is_text_row,
    })),
  });
  if (res.error || !res.invoiceId) return { error: res.error ?? "Kunde inte skapa fakturan." };

  await supabase.from("quotes").update({
    status: "invoiced",
    converted_invoice_id: res.invoiceId,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  revalidatePath("/offerter");
  revalidatePath("/fakturor");
  return { ok: true, invoiceId: res.invoiceId };
}

export async function deleteQuoteDraft(id: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id).eq("status", "draft");
  if (error) return { error: error.message };
  revalidatePath("/offerter");
  return { ok: true };
}

/* ---------- Pipeline ---------- */

const dealSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  customerId: z.string().uuid().nullable().optional(),
  contact: z.string().max(120).optional(),
  value: z.number().min(0).nullable().optional(),
  stage: z.enum(["lead", "contacted", "quoted", "won", "lost"]).default("lead"),
  nextAction: z.string().max(200).optional(),
  nextActionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(4000).optional(),
});

export async function saveDeal(input: unknown): Promise<{ ok?: boolean; error?: string }> {
  const parsed = dealSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const values = {
    title: d.title,
    customer_id: d.customerId ?? null,
    contact: d.contact || null,
    value: d.value ?? null,
    stage: d.stage,
    next_action: d.nextAction || null,
    next_action_at: d.nextActionAt ?? null,
    notes: d.notes || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = d.id
    ? await supabase.from("deals").update(values).eq("id", d.id)
    : await supabase.from("deals").insert(values);
  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function moveDeal(
  id: string,
  stage: "lead" | "contacted" | "quoted" | "won" | "lost"
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("deals")
    .update({ stage, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function deleteDeal(id: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return { ok: true };
}

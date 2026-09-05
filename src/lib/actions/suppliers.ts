"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { kronorToOre, oreToKronor, vatFromGross } from "@/lib/money";
import { z } from "zod";

const supplierSchema = z.object({
  name: z.string().min(1, "Namn krävs"),
  org_number: z.string().optional(),
  bankgiro: z.string().optional(),
  plusgiro: z.string().optional(),
  payment_terms: z.number().int().min(0).max(90).default(30),
  default_expense_account: z.number().int().nullable().optional(),
  notes: z.string().optional(),
});

export async function saveSupplier(id: string | null, input: unknown) {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("suppliers").update(parsed.data).eq("id", id)
    : await supabase.from("suppliers").insert(parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/leverantorer");
  return { ok: true };
}

const invoiceSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNo: z.string().optional(),
  ocr: z.string().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.number().positive("Belopp krävs"),
  vatRate: z.number(),
  expenseAccount: z.number().int(),
  description: z.string().min(1, "Beskrivning krävs"),
});

/**
 * Registrera leverantörsfaktura.
 * Faktureringsmetoden: bokförs direkt — D kostnad / D 2640 / K 2440 (serie C).
 * Kontantmetoden: endast reskontrapost; bokförs vid betalning.
 */
export async function registerSupplierInvoice(input: unknown) {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const [{ data: supplier }, { data: fy }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", d.supplierId).single(),
    supabase.from("fiscal_years").select("*")
      .lte("start_date", d.invoiceDate).gte("end_date", d.invoiceDate).single(),
  ]);
  if (!supplier) return { error: "Leverantören finns inte." };
  if (!fy) return { error: "Inget räkenskapsår för fakturadatumet." };

  const grossOre = kronorToOre(d.totalAmount);
  const vatOre = vatFromGross(grossOre, d.vatRate);
  const netOre = grossOre - vatOre;

  let verificationId: string | null = null;
  if (fy.accounting_method === "faktureringsmetoden") {
    const rows = [
      { account: d.expenseAccount, debit: oreToKronor(netOre), credit: 0 },
      ...(vatOre > 0 ? [{ account: 2640, debit: oreToKronor(vatOre), credit: 0 }] : []),
      { account: 2440, debit: 0, credit: d.totalAmount },
    ];
    const { data: ver, error: verErr } = await supabase.rpc("book_verification", {
      p_series_code: "C",
      p_date: d.invoiceDate,
      p_description: `${d.description} — ${supplier.name}`,
      p_rows: rows,
      p_counterparty: supplier.name,
      p_source: "supplier_invoice",
    });
    if (verErr) return { error: verErr.message };
    verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;
  }

  const { data: created, error } = await supabase.from("supplier_invoices").insert({
    supplier_id: d.supplierId,
    invoice_no: d.invoiceNo || null,
    ocr: d.ocr || null,
    invoice_date: d.invoiceDate,
    due_date: d.dueDate,
    total_amount: d.totalAmount,
    vat_amount: oreToKronor(vatOre),
    vat_rate: d.vatRate,
    expense_account: d.expenseAccount,
    notes: d.description,
    verification_id: verificationId,
  }).select("id").single();
  if (error) return { error: error.message };

  revalidatePath("/leverantorer");
  return { ok: true, id: created.id };
}

/** Bifoga fakturabilden/PDF:en till leverantörsfakturan (arkiveras 7 år) */
export async function attachSupplierFile(supplierInvoiceId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Ingen fil." };
  const supabase = await createClient();
  const { data: inv } = await supabase.from("supplier_invoices")
    .select("verification_id").eq("id", supplierInvoiceId).single();
  if (!inv) return { error: "Fakturan finns inte." };

  const path = `leverantorsfakturor/${supplierInvoiceId}/${file.name}`;
  const { error: upErr } = await supabase.storage.from("underlag")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return { error: upErr.message };

  await supabase.from("supplier_invoices")
    .update({ attachment_path: path }).eq("id", supplierInvoiceId);
  await supabase.from("attachments").insert({
    verification_id: inv.verification_id,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
  });
  revalidatePath("/leverantorer");
  return { ok: true };
}

export async function paySupplierInvoice(input: {
  supplierInvoiceId: string;
  paymentDate: string;
  amount: number;
}) {
  const supabase = await createClient();
  const { data: inv } = await supabase.from("supplier_invoices")
    .select("*, suppliers(name), supplier_payments(amount)")
    .eq("id", input.supplierInvoiceId).single();
  if (!inv) return { error: "Fakturan finns inte." };
  if (input.amount <= 0) return { error: "Beloppet måste vara positivt." };

  const paid = ((inv.supplier_payments ?? []) as { amount: number }[])
    .reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(inv.total_amount) - paid;
  if (input.amount > remaining + 0.005) {
    return { error: `Beloppet överstiger kvarvarande ${remaining.toFixed(2)} kr.` };
  }

  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .lte("start_date", input.paymentDate).gte("end_date", input.paymentDate).single();
  if (!fy) return { error: "Inget räkenskapsår för betaldatumet." };

  let rows: { account: number; debit: number; credit: number }[];
  if (fy.accounting_method === "faktureringsmetoden") {
    rows = [
      { account: 2440, debit: input.amount, credit: 0 },
      { account: 1930, debit: 0, credit: input.amount },
    ];
  } else {
    // Kontantmetoden: kostnad + moms bokförs proportionellt vid betalning
    const share = input.amount / Number(inv.total_amount);
    const vatPart = Math.round(Number(inv.vat_amount) * share * 100) / 100;
    const netPart = Math.round((input.amount - vatPart) * 100) / 100;
    rows = [
      { account: inv.expense_account ?? 6990, debit: netPart, credit: 0 },
      ...(vatPart > 0 ? [{ account: 2640, debit: vatPart, credit: 0 }] : []),
      { account: 1930, debit: 0, credit: input.amount },
    ];
  }

  const { data: ver, error: verErr } = await supabase.rpc("book_verification", {
    p_series_code: "C",
    p_date: input.paymentDate,
    p_description: `Betalning ${inv.suppliers?.name}${inv.invoice_no ? ` faktura ${inv.invoice_no}` : ""}`,
    p_rows: rows,
    p_counterparty: inv.suppliers?.name,
    p_source: "supplier_payment",
  });
  if (verErr) return { error: verErr.message };

  const verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;
  const { error } = await supabase.from("supplier_payments").insert({
    supplier_invoice_id: input.supplierInvoiceId,
    payment_date: input.paymentDate,
    amount: input.amount,
    verification_id: verificationId,
  });
  if (error) return { error: error.message };

  const newStatus = paid + input.amount >= Number(inv.total_amount) - 0.005
    ? "paid" : "partially_paid";
  await supabase.from("supplier_invoices").update({ status: newStatus })
    .eq("id", input.supplierInvoiceId);

  revalidatePath("/leverantorer");
  // Se kommentaren i registerPayment: bankraden ska kunna peka på verifikatet.
  return { ok: true, verificationId };
}

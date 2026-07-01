"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBankCsv } from "@/lib/bank/csv-parser";
import {
  gocardlessConfigured, listSwedishBanks, createRequisition,
  getRequisitionAccounts, getAccountDetails, getAccountTransactions,
  describeTransaction,
} from "@/lib/bank/gocardless";
import { registerPayment } from "@/lib/actions/invoices";
import { paySupplierInvoice } from "@/lib/actions/suppliers";

/* ---------- CSV-import ---------- */

export async function importBankCsv(formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Ingen fil vald." };

  const content = Buffer.from(await file.arrayBuffer()).toString("utf-8");
  const parsed = parseBankCsv(content);
  if (!parsed.transactions.length) {
    return { error: parsed.warnings[0] ?? "Inga transaktioner hittades i filen." };
  }

  const supabase = await createClient();
  let imported = 0, duplicates = 0;
  for (const tx of parsed.transactions) {
    const { error } = await supabase.from("bank_transactions").insert({
      connection_id: null,
      external_id: null,
      booking_date: tx.bookingDate,
      amount: tx.amount,
      description: tx.description,
      balance_after: tx.balanceAfter,
    });
    if (error?.code === "23505") duplicates++; // dedup-index
    else if (error) return { error: error.message };
    else imported++;
  }

  revalidatePath("/bank");
  return { ok: true, bank: parsed.bank, imported, duplicates, warnings: parsed.warnings };
}

/* ---------- GoCardless (PSD2) ---------- */

export async function getBankList() {
  if (!gocardlessConfigured()) {
    return { error: "Bankkoppling kräver GoCardless-nycklar — se instruktionerna på banksidan." };
  }
  try {
    const banks = await listSwedishBanks();
    return { banks: banks.map((b) => ({ id: b.id, name: b.name, logo: b.logo })) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function connectBank(institutionId: string, institutionName: string, appUrl: string) {
  if (!gocardlessConfigured()) return { error: "GoCardless-nycklar saknas." };
  try {
    const { requisitionId, link } = await createRequisition(
      institutionId, `${appUrl}/bank?connected=1`);
    const supabase = await createClient();
    const { error } = await supabase.from("bank_connections").insert({
      provider: "gocardless",
      institution_id: institutionId,
      institution_name: institutionName,
      requisition_id: requisitionId,
      status: "pending",
    });
    if (error) return { error: error.message };
    return { ok: true, link };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Efter BankID-godkännande: hämta konto-id + kör första synken */
export async function finalizeBankConnection() {
  const supabase = await createClient();
  const { data: pending } = await supabase.from("bank_connections")
    .select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(1);
  const conn = pending?.[0];
  if (!conn?.requisition_id) return { error: "Ingen väntande koppling." };

  try {
    const req = await getRequisitionAccounts(conn.requisition_id);
    if (req.status !== "LN" || !req.accounts.length) {
      return { error: `Kopplingen är inte klar hos banken ännu (status ${req.status}). Slutför BankID-flödet och försök igen.` };
    }
    const accountId = req.accounts[0];
    const details = await getAccountDetails(accountId);
    const expires = new Date();
    expires.setDate(expires.getDate() + 90); // PSD2-samtycke, typiskt 90 dagar

    await supabase.from("bank_connections").update({
      account_id: accountId,
      account_iban: details.iban ?? null,
      status: "linked",
      consent_expires_at: expires.toISOString(),
    }).eq("id", conn.id);

    revalidatePath("/bank");
    return await syncBankTransactions(conn.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function syncBankTransactions(connectionId: string) {
  const supabase = await createClient();
  const { data: conn } = await supabase.from("bank_connections")
    .select("*").eq("id", connectionId).single();
  if (!conn?.account_id) return { error: "Kopplingen saknar konto." };

  try {
    const since = conn.last_synced_at
      ? new Date(new Date(conn.last_synced_at).getTime() - 7 * 86400000).toISOString().slice(0, 10)
      : undefined;
    const txs = await getAccountTransactions(conn.account_id, since);
    let imported = 0;
    for (const t of txs) {
      const { error } = await supabase.from("bank_transactions").insert({
        connection_id: conn.id,
        external_id: t.transactionId ?? t.internalTransactionId ?? null,
        booking_date: t.bookingDate,
        amount: parseFloat(t.transactionAmount.amount),
        currency: t.transactionAmount.currency,
        description: describeTransaction(t),
        counterpart: t.creditorName ?? t.debtorName ?? null,
      });
      if (!error) imported++;
      // 23505 = dublett, ignoreras tyst
    }
    await supabase.from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
    revalidatePath("/bank");
    return { ok: true, imported, total: txs.length };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("401") || msg.includes("403")) {
      await supabase.from("bank_connections").update({ status: "expired" }).eq("id", conn.id);
      return { error: "Bankens samtycke har gått ut — koppla om kontot (BankID)." };
    }
    return { error: msg };
  }
}

/* ---------- Bokning av banktransaktioner ---------- */

async function markTransaction(
  txId: string,
  status: "booked" | "matched" | "ignored",
  verificationId?: string | null
) {
  const supabase = await createClient();
  await supabase.from("bank_transactions")
    .update({ status, verification_id: verificationId ?? null })
    .eq("id", txId);
  revalidatePath("/bank");
}

export async function bookTxAsCustomerPayment(txId: string, invoiceId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: tx } = await supabase.from("bank_transactions").select("*").eq("id", txId).single();
  if (!tx) return { error: "Transaktionen finns inte." };
  const res = await registerPayment({
    invoiceId,
    paymentDate: tx.booking_date,
    amount: Number(tx.amount),
  });
  if (res.error) return res;
  await markTransaction(txId, "booked");
  return { ok: true };
}

export async function bookTxAsSupplierPayment(txId: string, supplierInvoiceId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: tx } = await supabase.from("bank_transactions").select("*").eq("id", txId).single();
  if (!tx) return { error: "Transaktionen finns inte." };
  const res = await paySupplierInvoice({
    supplierInvoiceId,
    paymentDate: tx.booking_date,
    amount: -Number(tx.amount),
  });
  if (res.error) return res;
  await markTransaction(txId, "booked");
  return { ok: true };
}

/** Bokför transaktionen med valfri kontering (konto + momshantering sköts av anroparen) */
export async function bookTxWithRows(txId: string, rows: { account: number; debit: number; credit: number }[], description: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: tx } = await supabase.from("bank_transactions").select("*").eq("id", txId).single();
  if (!tx) return { error: "Transaktionen finns inte." };
  const { data, error } = await supabase.rpc("book_verification", {
    p_series_code: "A",
    p_date: tx.booking_date,
    p_description: description,
    p_rows: rows,
    p_counterparty: tx.counterpart ?? undefined,
    p_source: "quick_event",
  });
  if (error) return { error: error.message };
  const verId = (Array.isArray(data) ? data[0] : data)?.out_id ?? null;
  await markTransaction(txId, "booked", verId);
  return { ok: true };
}

export async function matchTxToVerification(txId: string, verificationId: string): Promise<{ ok?: boolean; error?: string }> {
  await markTransaction(txId, "matched", verificationId);
  return { ok: true };
}

export async function ignoreTx(txId: string): Promise<{ ok?: boolean; error?: string }> {
  await markTransaction(txId, "ignored");
  return { ok: true };
}

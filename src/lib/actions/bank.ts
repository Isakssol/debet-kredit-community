"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBankCsv } from "@/lib/bank/csv-parser";
import {
  enableBankingConfigured, listSwedishBanks, startAuth, createSession,
  getAccountTransactions, txSignedAmount, describeTransaction, txCounterpart,
} from "@/lib/bank/enable-banking";
import { registerPayment } from "@/lib/actions/invoices";
import { paySupplierInvoice } from "@/lib/actions/suppliers";
import {
  matchingRules, buildRuleRows, ruleDescription, type BankRule, type RuleTx,
} from "@/lib/bank/rules";
import { z } from "zod";

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

/* ---------- Bokföringsregler ---------- */

const bankRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  match_text: z.string().min(2).max(120),
  direction: z.enum(["in", "out", "both"]),
  account: z.number().int(),
  vat_rate: z.number().refine((v) => [0, 6, 12, 25].includes(v), "Momssats 0/6/12/25"),
  liquidity_account: z.number().int(),
  active: z.boolean().optional(),
});

export async function saveBankRule(input: unknown): Promise<{ ok?: boolean; error?: string }> {
  const parsed = bankRuleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { id, ...values } = parsed.data;
  const { error } = id
    ? await supabase.from("bank_rules").update(values).eq("id", id)
    : await supabase.from("bank_rules").insert(values);
  if (error) return { error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

export async function deleteBankRule(id: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_rules").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/**
 * Kör reglerna mot alla ohanterade transaktioner och bokför varje entydig
 * träff. Körs bara när du trycker på "Bokför alla regelträffar" — inget
 * bokförs av sig självt vid import eller synk.
 */
export async function runBankRules(): Promise<{
  ok?: boolean; error?: string; booked?: number; skipped?: string[];
}> {
  const supabase = await createClient();
  const [{ data: rules }, { data: txs }] = await Promise.all([
    supabase.from("bank_rules").select("*").eq("active", true),
    supabase.from("bank_transactions").select("id, booking_date, amount, description, counterpart")
      .eq("status", "unmatched").order("booking_date"),
  ]);
  if (!rules?.length || !txs?.length) return { ok: true, booked: 0, skipped: [] };

  let booked = 0;
  const skipped: string[] = [];
  for (const tx of txs as RuleTx[]) {
    const hits = matchingRules(tx, rules as BankRule[]);
    if (hits.length === 0) continue;
    if (hits.length > 1) {
      skipped.push(`${tx.booking_date} "${tx.description}": matchar ${hits.length} regler — hanteras manuellt`);
      continue;
    }
    const rule = hits[0];
    const res = await bookTxWithRows(tx.id, buildRuleRows(tx, rule), ruleDescription(tx, rule));
    if (res.error) skipped.push(`${tx.booking_date} "${tx.description}": ${res.error}`);
    else booked++;
  }
  revalidatePath("/bank");
  return { ok: true, booked, skipped };
}

/* ---------- GoCardless (PSD2) ---------- */

export async function getBankList() {
  if (!enableBankingConfigured()) {
    return { error: "Bankkoppling kräver Enable Banking-nycklar — se instruktionerna på banksidan." };
  }
  try {
    const banks = await listSwedishBanks();
    return {
      banks: banks.map((b) => ({
        id: b.name, // Enable Banking identifierar banken med namn + land
        name: b.name,
        maxConsentSeconds: b.maximum_consent_validity,
      })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function connectBank(
  aspspName: string,
  maxConsentSeconds: number,
  appUrl: string,
  psuType: "personal" | "business" = "personal"
) {
  if (!enableBankingConfigured()) return { error: "Enable Banking-nycklar saknas." };
  try {
    const { url } = await startAuth(aspspName, `${appUrl}/bank`, maxConsentSeconds, psuType);
    const supabase = await createClient();
    const { error } = await supabase.from("bank_connections").insert({
      provider: "enablebanking",
      institution_id: aspspName,
      institution_name: aspspName,
      status: "pending",
    });
    if (error) return { error: error.message };
    return { ok: true, link: url };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Efter BankID hos banken: växla callback-koden mot session + kör första synken */
export async function finalizeBankConnection(code: string) {
  const supabase = await createClient();
  const { data: pending } = await supabase.from("bank_connections")
    .select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(1);
  const conn = pending?.[0];
  if (!conn) return { error: "Ingen väntande koppling — börja om med Koppla bankkonto." };

  try {
    const session = await createSession(code);
    if (!session.accounts.length) {
      return { error: "Banken returnerade inga konton — kontrollera att kontot valdes i BankID-flödet." };
    }
    const account = session.accounts[0];
    const expires = new Date();
    expires.setDate(expires.getDate() + 180); // Enable Banking: upp till 180 dagars samtycke

    await supabase.from("bank_connections").update({
      requisition_id: session.sessionId,
      account_id: account.uid,
      account_iban: account.account_id?.iban ?? null,
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
        external_id: t.entry_reference ?? null,
        booking_date: t.booking_date!,
        amount: txSignedAmount(t),
        currency: t.transaction_amount.currency,
        description: describeTransaction(t),
        counterpart: txCounterpart(t),
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

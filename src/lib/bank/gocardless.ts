/**
 * GoCardless Bank Account Data (fd Nordigen) — PSD2-kontoinformation (AIS)
 * för svenska banker via aggregatorns AISP-licens. Kräver gratis konto på
 * bankaccountdata.gocardless.com → GOCARDLESS_SECRET_ID + GOCARDLESS_SECRET_KEY.
 *
 * Flöde: token → institutions (SE) → requisition (användaren godkänner med
 * BankID hos sin bank) → accounts → transactions.
 */

const BASE = "https://bankaccountdata.gocardless.com/api/v2";

export function gocardlessConfigured(): boolean {
  return !!process.env.GOCARDLESS_SECRET_ID && !!process.env.GOCARDLESS_SECRET_KEY;
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GoCardless token: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access as string;
}

async function gc<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GoCardless ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type Institution = { id: string; name: string; bic: string; logo: string };

export async function listSwedishBanks(): Promise<Institution[]> {
  const token = await getAccessToken();
  return gc<Institution[]>(`/institutions/?country=se`, token);
}

/** Skapa koppling — returnerar länken användaren öppnar för BankID hos banken */
export async function createRequisition(
  institutionId: string,
  redirectUrl: string
): Promise<{ requisitionId: string; link: string }> {
  const token = await getAccessToken();
  const data = await gc<{ id: string; link: string }>(`/requisitions/`, token, {
    method: "POST",
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      user_language: "SV",
    }),
  });
  return { requisitionId: data.id, link: data.link };
}

export async function getRequisitionAccounts(requisitionId: string): Promise<{
  status: string;
  accounts: string[];
}> {
  const token = await getAccessToken();
  const data = await gc<{ status: string; accounts: string[] }>(
    `/requisitions/${requisitionId}/`, token);
  return data;
}

export type GcTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate: string;
  transactionAmount: { amount: string; currency: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  debtorName?: string;
  additionalInformation?: string;
};

export async function getAccountDetails(accountId: string): Promise<{ iban?: string }> {
  const token = await getAccessToken();
  const data = await gc<{ account: { iban?: string } }>(`/accounts/${accountId}/details/`, token);
  return data.account;
}

export async function getAccountTransactions(accountId: string, fromDate?: string): Promise<GcTransaction[]> {
  const token = await getAccessToken();
  const qs = fromDate ? `?date_from=${fromDate}` : "";
  const data = await gc<{ transactions: { booked: GcTransaction[] } }>(
    `/accounts/${accountId}/transactions/${qs}`, token);
  return data.transactions.booked ?? [];
}

export async function getAccountBalance(accountId: string): Promise<number | null> {
  const token = await getAccessToken();
  const data = await gc<{ balances: { balanceAmount: { amount: string }; balanceType: string }[] }>(
    `/accounts/${accountId}/balances/`, token);
  const preferred = data.balances.find((b) => b.balanceType === "interimBooked")
    ?? data.balances.find((b) => b.balanceType === "closingBooked")
    ?? data.balances[0];
  return preferred ? parseFloat(preferred.balanceAmount.amount) : null;
}

export function describeTransaction(t: GcTransaction): string {
  const parts = [
    t.creditorName ?? t.debtorName,
    t.remittanceInformationUnstructured
      ?? t.remittanceInformationUnstructuredArray?.join(" ")
      ?? t.additionalInformation,
  ].filter(Boolean);
  return parts.join(" — ") || "Banktransaktion";
}

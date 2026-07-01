/**
 * Enable Banking — PSD2-kontoinformation (AIS) under deras licens
 * (auktoriserat betalningsinstitut, Finanssivalvonta). Gratis för egna konton
 * i "restricted mode". OBS: GoCardless/Nordigen stängde för nya kunder 2025.
 *
 * Setup: enablebanking.com/cp/applications → skapa app → ladda upp publikt
 * cert (RSA) → ENABLE_BANKING_APP_ID + ENABLE_BANKING_PRIVATE_KEY (PEM) i env.
 *
 * Auth: JWT RS256 signerad med appens privata nyckel.
 * Flöde: GET /aspsps?country=SE → POST /auth (BankID hos banken) →
 * callback med ?code= → POST /sessions → GET /accounts/{uid}/transactions.
 */

import crypto from "crypto";

const BASE = "https://api.enablebanking.com";

export function enableBankingConfigured(): boolean {
  return !!process.env.ENABLE_BANKING_APP_ID && !!process.env.ENABLE_BANKING_PRIVATE_KEY;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** RS256-JWT enligt Enable Bankings spec (kid = app_id, aud = api.enablebanking.com) */
function makeJwt(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID!;
  // PEM kan ligga i env med \n-escaper
  const pem = process.env.ENABLE_BANKING_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const payload = b64url(JSON.stringify({
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), pem);
  return `${header}.${payload}.${b64url(signature)}`;
}

async function eb<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${makeJwt()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Enable Banking ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type Aspsp = {
  name: string;
  country: string;
  maximum_consent_validity: number; // sekunder
  logo?: string;
};

export async function listSwedishBanks(): Promise<Aspsp[]> {
  const data = await eb<{ aspsps: Aspsp[] }>(`/aspsps?country=SE`);
  return data.aspsps;
}

/** Starta auktorisering — returnerar URL:en där användaren godkänner med BankID */
export async function startAuth(
  aspspName: string,
  redirectUrl: string,
  maxConsentSeconds: number,
  psuType: "personal" | "business" = "personal"
): Promise<{ url: string }> {
  // valid_until begränsas av bankens maximum_consent_validity (oftast 180 dagar)
  const seconds = Math.min(maxConsentSeconds || 180 * 86400, 180 * 86400);
  const validUntil = new Date(Date.now() + seconds * 1000).toISOString();
  const data = await eb<{ url: string }>(`/auth`, {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: aspspName, country: "SE" },
      state: crypto.randomUUID(),
      redirect_url: redirectUrl,
      psu_type: psuType,
      language: "sv",
    }),
  });
  return { url: data.url };
}

export type EbAccount = {
  uid: string;
  identification_hash: string;
  account_id?: { iban?: string };
  name?: string;
};

/** Efter callback: växla code mot session med kontolista */
export async function createSession(code: string): Promise<{
  sessionId: string;
  accounts: EbAccount[];
}> {
  const data = await eb<{ session_id: string; accounts: EbAccount[] }>(`/sessions`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return { sessionId: data.session_id, accounts: data.accounts ?? [] };
}

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  booking_date?: string | null;
  value_date?: string | null;
  status?: string;
  remittance_information?: string[] | null;
  creditor?: { name?: string } | null;
  debtor?: { name?: string } | null;
};

/** Hämtar alla bokförda transaktioner med paginering (continuation_key) */
export async function getAccountTransactions(
  accountUid: string,
  fromDate?: string
): Promise<EbTransaction[]> {
  const all: EbTransaction[] = [];
  let continuation: string | undefined;
  do {
    const params = new URLSearchParams();
    if (fromDate) params.set("date_from", fromDate);
    if (continuation) params.set("continuation_key", continuation);
    const qs = params.toString() ? `?${params}` : "";
    const data = await eb<{ transactions: EbTransaction[]; continuation_key?: string }>(
      `/accounts/${accountUid}/transactions${qs}`);
    all.push(...(data.transactions ?? []));
    continuation = data.continuation_key;
  } while (continuation);
  // Endast bokförda (BOOK) — pending saknar bokföringsdag
  return all.filter((t) => t.booking_date && (!t.status || t.status === "BOOK"));
}

export async function getAccountBalance(accountUid: string): Promise<number | null> {
  const data = await eb<{ balances: { balance_amount: { amount: string }; balance_type: string }[] }>(
    `/accounts/${accountUid}/balances`);
  const preferred = data.balances?.find((b) => b.balance_type?.includes("ITBD"))
    ?? data.balances?.[0];
  return preferred ? parseFloat(preferred.balance_amount.amount) : null;
}

export function txSignedAmount(t: EbTransaction): number {
  const raw = parseFloat(t.transaction_amount.amount);
  return t.credit_debit_indicator === "DBIT" ? -Math.abs(raw) : Math.abs(raw);
}

export function describeTransaction(t: EbTransaction): string {
  const counterpart = t.credit_debit_indicator === "DBIT"
    ? t.creditor?.name
    : t.debtor?.name;
  const parts = [counterpart, t.remittance_information?.join(" ")].filter(Boolean);
  return parts.join(" — ") || "Banktransaktion";
}

export function txCounterpart(t: EbTransaction): string | null {
  return (t.credit_debit_indicator === "DBIT" ? t.creditor?.name : t.debtor?.name) ?? null;
}

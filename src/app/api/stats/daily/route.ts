/**
 * GET /api/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Read-only daglig intäktsstatistik för externa system (verkstadens adminpanel).
 * Auth: Authorization: Bearer <STATS_API_KEY>  (miljövariabel, aldrig i källkod)
 *
 * Svar: JSON-array med ett objekt per kalenderdag i intervallet (även tomma dagar).
 * Alla belopp i SEK exkl moms, heltal (öresavrundade). Datum = verifikationsdatum
 * (affärshändelsens datum, lagrat som DATE utan tidszon → tolkas som Europe/Stockholm).
 *
 * Kategorisering verkstad/OBD (se MAPPNINGSREGEL i svaret på rapporten):
 *   revenue_obd      = intäkter på konto 3001 (Försäljning varor 25 %) — OBD-Flasher
 *                      säljs som vara (hårdvara + mjukvara), samt alla intäktsrader
 *                      vars text matchar /obd|flasher|dongel/i (säkerhetsnät).
 *   revenue_verkstad = allt övrigt i kontoklass 30xx–37xx (tjänster: optimering,
 *                      EGR/DPF/AdBlue etc). Okategoriserat hamnar här → total alltid = summa.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_DAYS = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OBD_ACCOUNTS = new Set([3001]); // varuförsäljning 25 % = OBD-Flasher (hårdvara + mjukvara)
const OBD_TEXT = /\b(obd|flasher|dongel|dongle|at\s?one|autotuner one)\b/i;

// Enkel in-memory rate limit (per instans). Serverless → best effort, men stoppar loopar.
const RATE_LIMIT = 60; // anrop per timme per nyckel-prefix
const hits = new Map<string, { count: number; windowStart: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.windowStart > 3_600_000) {
    hits.set(key, { count: 1, windowStart: now });
    return false;
  }
  h.count += 1;
  return h.count > RATE_LIMIT;
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function parseDate(s: string | null): Date | null {
  if (!s || !DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Avvisa t.ex. 2026-02-30 (JS rullar över till mars)
  return d.toISOString().slice(0, 10) === s ? d : null;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  // ---- Auth (konstant-tids-jämförelse) ----
  const expected = process.env.STATS_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return unauthorized();
  if (rateLimited(presented.slice(0, 8))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ---- Validera intervall ----
  const { searchParams } = request.nextUrl;
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));
  if (!from || !to) return badRequest("invalid_date: use from=YYYY-MM-DD&to=YYYY-MM-DD");
  if (to < from) return badRequest("invalid_range: to must be >= from");
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MAX_DAYS) return badRequest(`range_too_large: max ${MAX_DAYS} days per request`);

  // ---- Read-only DB-klient (service role, ingen cookie-session) ----
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const fromS = iso(from);
  const toS = iso(to);

  // Intäktsrader (30xx–37xx) med verifikatets datum. Kredit = intäkt, debet = återföring.
  const [{ data: rows, error: rowsErr }, { data: vers, error: verErr }, { data: openInv, error: invErr }] =
    await Promise.all([
      supabase
        .from("verification_rows")
        .select("account, debit, credit, note, verifications!inner(verification_date, description)")
        .gte("account", 3000)
        .lte("account", 3799)
        .gte("verifications.verification_date", fromS)
        .lte("verifications.verification_date", toS),
      // "Utställda kvitton/fakturor" = verifikat med intäktsrad per dag, exkl rättelser.
      // OBS: återbetalningar bokförda som vanliga verifikat (source=manual) räknas som 1 kvitto
      // (kreditkvitto) — beloppet blir negativt i revenue_* vilket är korrekt.
      supabase
        .from("verifications")
        .select("id, verification_date, verification_rows!inner(account)")
        .gte("verification_date", fromS)
        .lte("verification_date", toS)
        .neq("source", "correction") // rättelse-/vändningsverifikat är inte kvitton
        .gte("verification_rows.account", 3000)
        .lte("verification_rows.account", 3799),
      // Utestående kundfordringar (fakturamodulen) — ögonblicksvärde
      supabase
        .from("invoices")
        .select("total_amount, invoice_payments(amount)")
        .in("status", ["booked", "sent", "partially_paid", "overdue"])
        .eq("type", "debit"),
    ]);

  if (rowsErr || verErr || invErr) {
    return NextResponse.json(
      { error: "db_error", detail: (rowsErr ?? verErr ?? invErr)?.message },
      { status: 500 }
    );
  }

  // Unpaid: ögonblicksvärde (samma i alla rader) — fakturamodulens öppna poster exkl moms.
  // total_amount lagras inkl moms → räknas ner med 1,25 (alla kundfakturor 25 % i denna firma).
  const unpaidInclVat = (openInv ?? []).reduce((s, inv) => {
    const paid = (inv.invoice_payments ?? []).reduce((p, x) => p + Number(x.amount), 0);
    return s + Math.max(0, Number(inv.total_amount) - paid);
  }, 0);
  const unpaid_amount = Math.round(unpaidInclVat / 1.25);

  // Aggregera per dag
  type Day = { revenue_total: number; revenue_verkstad: number; revenue_obd: number; invoices_count: number };
  const byDay = new Map<string, Day>();
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    byDay.set(iso(d), { revenue_total: 0, revenue_verkstad: 0, revenue_obd: 0, invoices_count: 0 });
  }

  type Row = { account: number; debit: number; credit: number; note: string | null;
               verifications: { verification_date: string; description: string } };
  for (const r of (rows ?? []) as unknown as Row[]) {
    const day = byDay.get(r.verifications.verification_date);
    if (!day) continue;
    const amount = Number(r.credit) - Number(r.debit);
    const text = `${r.note ?? ""} ${r.verifications.description ?? ""}`;
    const isObd = OBD_ACCOUNTS.has(r.account) || OBD_TEXT.test(text);
    if (isObd) day.revenue_obd += amount;
    else day.revenue_verkstad += amount;
    day.revenue_total += amount;
  }
  type Ver = { id: string; verification_date: string };
  const seen = new Set<string>();
  for (const v of (vers ?? []) as unknown as Ver[]) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    const day = byDay.get(v.verification_date);
    if (day) day.invoices_count += 1;
  }

  const result = [...byDay.entries()].map(([date, d]) => {
    const obd = Math.round(d.revenue_obd);
    const verkstad = Math.round(d.revenue_verkstad);
    return {
      date,
      revenue_total: obd + verkstad, // garanterar total = verkstad + obd även efter avrundning
      revenue_verkstad: verkstad,
      revenue_obd: obd,
      invoices_count: d.invoices_count,
      unpaid_amount,
    };
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });
}

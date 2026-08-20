/** Delad auth + DB-klient för stats-API:et. Read-only, Bearer-nyckel i STATS_API_KEY. */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export function checkAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.STATS_API_KEY;
  if (!expected) return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export const ANALYTICS_SELECT =
  "account, debit, credit, note, verifications!inner(id, verification_date, description, counterparty, source, corrected_by_id)";

export const noStore = { headers: { "Cache-Control": "no-store" } };

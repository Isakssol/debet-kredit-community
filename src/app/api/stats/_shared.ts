/** Delad auth + DB-klient för stats-API:et. Read-only, Bearer-nyckel: en API-nyckel med data:read eller STATS_API_KEY. */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { requireApiKey } from "@/lib/api/auth";
import { presenterarApiNyckel } from "@/lib/api/legacy-auth";

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

/**
 * Två vägar in, och den gamla är oförändrad.
 *
 * En `dk_live_`-nyckel med behörigheten `data:read` autentiseras genom
 * `requireApiKey()` — identitet, scope, kvot i databasen och en
 * återkallningsknapp. Allt annat faller tillbaka på `checkAuth()` och
 * `STATS_API_KEY` exakt som förut, ned till felkropparna: en installation som
 * redan har ett Excel-ark eller en adminpanel uppkopplad ska inte behöva röra
 * den.
 *
 * DATAVÄGEN ÄR MED FLIT OFÖRÄNDRAD. Rutterna läser fortfarande med
 * service-klienten. Det ser ut som en avvikelse från principen att en nyckel
 * ska köra som sig själv, och det är ett medvetet val: de här rutterna svarar
 * med AGGREGAT, samma aggregat som redan lämnas ut mot en delad miljösträng
 * utan någon identitet alls. Att byta datavägen hade ändrat vad de svarar för
 * den befintliga nyckeln — alltså precis det den här ändringen lovar att inte
 * göra. De nya `/api/v1/`-rutterna, som lämnar ut affärshändelser rad för rad,
 * kör som nyckeln och lyder RLS.
 *
 * @returns null när anropet är godkänt, annars svaret att returnera.
 */
export async function checkStatsAuth(request: NextRequest): Promise<NextResponse | null> {
  if (!presenterarApiNyckel(request)) return checkAuth(request);

  const auth = await requireApiKey(request, "data:read");
  return auth.ok ? null : (auth.response as NextResponse);
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

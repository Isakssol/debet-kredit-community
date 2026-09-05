/**
 * POST /api/byra/token
 *
 * Växlar en byrånyckel mot en kortlivad inloggning med rollen `byra`.
 *
 *   Authorization: Bearer dkb_...
 *   → 200 { access_token, token_type, expires_in, expires_at, scopes, agency }
 *   → 401 { error: "unauthorized" }    okänd eller felformad nyckel
 *   → 401 { error: "key_revoked" }     klienten har dragit in åtkomsten
 *   → 429 { error: "rate_limited" }
 *   → 503 { error: "server_misconfigured" | "token_unavailable" }
 *
 * Token används sedan som vanlig Bearer mot läs-API:et. Den ger åtkomst till
 * exakt en sak — vyn byra_stats — och det upprätthålls av databasen, inte av
 * den här rutten. Se 20260907000012_byra_keys.sql.
 *
 * Rutten gör ingenting i en installation där ingen nyckel utfärdats: varje
 * anrop svarar 401 tills du själv skapat en under Inställningar → Byråns
 * åtkomst.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/service";
import { exchangeByraKey, type ByraKeyRow, type ByraSession } from "@/lib/byra/exchange";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Enkel in-memory rate limit (per instans). Serverless → best effort, samma
 * form som /api/stats/daily. Nyckeln har 256 bitars entropi och kan inte
 * gissas; det här stoppar loopar och håller nere trafiken mot GoTrue, inte
 * en angripare.
 */
const RATE_LIMIT = 60; // växlingar per timme och avsändare
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

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "okand";
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!admin || !anonKey || !url) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503, ...noStore });
  }

  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, ...noStore });
  }

  const result = await exchangeByraKey(
    {
      async findKeyByHash(hash): Promise<ByraKeyRow | null> {
        const { data, error } = await admin
          .from("byra_keys")
          .select("id, agency_name, scopes, auth_user_id, revoked_at")
          .eq("key_hash", hash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as ByraKeyRow | null) ?? null;
      },

      /**
       * Sessionen skapas av Supabase själv: en engångslänk för maskinkontot
       * växlas direkt mot en session. Adressen läses ur kontot i stället för
       * att härledas ur ett id, så en adress som ändrats i panelen inte tyst
       * slutar fungera.
       *
       * Uppdateringstoken rivs direkt efteråt. Kvar blir bara den timme långa
       * åtkomsttoken — portalen ska växla nyckeln på nytt, inte bygga en egen
       * sessionshistorik i klientens databas.
       */
      async mintSession(authUserId): Promise<ByraSession | null> {
        const { data: user, error: userErr } = await admin.auth.admin.getUserById(authUserId);
        if (userErr || !user?.user?.email) return null;

        const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: user.user.email,
        });
        const tokenHash = link?.properties?.hashed_token;
        if (linkErr || !tokenHash) return null;

        const anon = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
          token_hash: tokenHash,
          type: "magiclink",
        });
        const session = verified?.session;
        if (verifyErr || !session?.access_token) return null;

        try {
          await admin.auth.admin.signOut(session.access_token, "global");
        } catch {
          /* best effort — åtkomsttoken lever ändå ut sin tid */
        }

        return {
          access_token: session.access_token,
          expires_in: session.expires_in ?? 3600,
          expires_at: session.expires_at ?? null,
        };
      },

      async markUsed(keyId) {
        await admin.from("byra_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
      },
    },
    request.headers.get("authorization")
  );

  return NextResponse.json(result.body, { status: result.status, ...noStore });
}

/** Endast POST. En token är inte en resurs som kan hämtas om. */
export async function GET() {
  return NextResponse.json(
    { error: "method_not_allowed", message: "Använd POST med Authorization: Bearer <byrånyckel>." },
    { status: 405, ...noStore }
  );
}

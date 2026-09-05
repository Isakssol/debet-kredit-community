import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/service";
import { apiError, newRequestId } from "./errors";
import { clientIp, hashApiKey } from "./keys";
import type { ApiScope } from "./scopes";
import {
  authenticateApiKey,
  type ApiKeyRow,
  type ApiSession,
  type AuthenticateDeps,
} from "./authenticate";

/**
 * `requireApiKey()` — ETT anrop, inte ett mönster att kopiera.
 *
 * `src/proxy.ts` undantar `/api/` från inloggningsproxyn, så varje rutt bär
 * hela sin egen autentisering. Det är rätt konstruktion, men det betyder också
 * att en ny rutt utan auth är öppen mot internet i samma sekund den läggs till.
 * Därför ska den här filen vara det enda stället autentiseringen skrivs: en ny
 * rutt kallar `requireApiKey(request, scope)` först, och kan inte råka
 * implementera hälften av kontrollerna.
 *
 * SESSIONSKLIENT, INTE SERVICE-KLIENT. Det är det viktigaste beslutet i hela
 * v1, och i den här utgåvan är det avgörande snarare än bara rätt. Både
 * spärrarna och vakttriggern i 20260908000005 känner igen maskinkontot på
 * `auth.uid()`. En service-klient har ingen `auth.uid()` alls: den räknas som
 * betrodd, går förbi RLS och passerar vakten utan att någon scope-kontroll
 * sker. En session mintad för nyckelns eget maskinkonto ger i stället att RLS
 * *och* vakten *och* motorns egna lås gäller, och att en läckt nyckel har
 * exakt det som står i dess scopes i stället för hela databasen. Det är också
 * det enda som gör att vi kan säga rakt ut att en API-nyckel inte når
 * företagsuppgifterna eller underlagen.
 */

/**
 * Sessionen cachas per instans tills en marginal före utgången.
 *
 * DET ÄR OFARLIGT, OCH SKÄLET ÄR VÄRT ATT LÄSA TVÅ GÅNGER: token bär ingen
 * behörighet alls. `is_api_machine()` och `api_has_scope()` läser `api_keys` i
 * VARJE fråga, så en cachad token för en återkallad nyckel öppnar ingenting —
 * kontot är fortfarande en maskin, men ingen öppning gäller längre. Cachen
 * sparar en växling mot GoTrue, inte ett behörighetsbeslut.
 */
const MARGINAL_MS = 5 * 60 * 1000;
const sessionCache = new Map<string, { token: string; expiresAtMs: number }>();

function cachadSession(hash: string): string | null {
  const träff = sessionCache.get(hash);
  if (!träff) return null;
  if (träff.expiresAtMs - MARGINAL_MS <= Date.now()) {
    sessionCache.delete(hash);
    return null;
  }
  return träff.token;
}

/**
 * Räknare mot AVSÄNDARADRESS för anrop som aldrig hittar en giltig nyckel.
 *
 * Kvoten i databasen räknar per nyckel och kan därför inte räkna det här:
 * ett anrop utan giltig nyckel har ingen nyckel att räkna på. Räknaren stoppar
 * loopar och håller nere trafiken mot databasen — den behövs inte mot
 * gissningar, eftersom 256 bitars entropi inte gissas.
 */
/**
 * ATT LÄSA OCH ATT RÄKNA ÄR TVÅ FUNKTIONER, OCH DET ÄR HELA POÄNGEN. En enda
 * funktion som både prövade taket och räknade upp skulle räkna varje anrop,
 * inte varje avvisat anrop — och då vore det här taket i praktiken hela API:ets
 * kvot. En nyckel med förvalet 600 anrop i timmen hade stannat på 60 så fort
 * integrationen ringer från en och samma server, vilket den alltid gör. Kvoten
 * i `api_keys.rate_limit_per_hour` hade blivit en siffra utan verkan, och
 * dokumentationens 600 ett löfte installationen inte håller. Prövat skarpt:
 * 200 giltiga anrop i rad från en adress går fram nu, mot 60 före.
 *
 * Uppräkningen sker på exakt ett ställe: efter ett 401, alltså när anropet
 * bevisligen inte bar en giltig nyckel. Ett 403 räknas inte — där finns en
 * giltig nyckel, och den har redan betalat ur sin egen kvot.
 */
const AVVISADE_TAK = 60;
const AVVISADE_FONSTER_MS = 3_600_000;
/** Taket för hur många adresser som får ligga i minnet innan gamla städas. */
const AVVISADE_MAX_ADRESSER = 10_000;
const avvisade = new Map<string, { count: number; windowStart: number }>();

/** Läser räknaren. Rör den aldrig. */
export function forMangaAvvisade(ip: string): boolean {
  const h = avvisade.get(ip);
  if (!h) return false;
  if (Date.now() - h.windowStart > AVVISADE_FONSTER_MS) {
    avvisade.delete(ip);
    return false;
  }
  return h.count >= AVVISADE_TAK;
}

/**
 * Räknar upp ett avvisat anrop.
 *
 * Nycklarna i kartan är avsändaradresser, alltså något anroparen väljer. Utan
 * ett tak kan en spridd källa fylla minnet med adresser som aldrig återkommer,
 * så en full karta sveps på utgångna fönster innan nästa adress läggs till.
 */
export function raknaAvvisat(ip: string): void {
  const now = Date.now();
  const h = avvisade.get(ip);
  if (h && now - h.windowStart <= AVVISADE_FONSTER_MS) {
    h.count += 1;
    return;
  }
  if (!h && avvisade.size >= AVVISADE_MAX_ADRESSER) {
    for (const [adress, post] of avvisade) {
      if (now - post.windowStart > AVVISADE_FONSTER_MS) avvisade.delete(adress);
    }
  }
  avvisade.set(ip, { count: 1, windowStart: now });
}

export type ApiContext = {
  /** Raden nyckeln pekar ut. `key_hash` hämtas aldrig hit. */
  key: ApiKeyRow;
  scopes: string[];
  /** Klient som kör som nyckelns maskinkonto: RLS och rollkontroll gäller. */
  supabase: SupabaseClient;
  /** Service-klient för det som ligger utanför RLS (kvot, idempotens). */
  admin: SupabaseClient;
  requestId: string;
  ip: string;
};

export type RequireApiKeyResult =
  | { ok: true; ctx: ApiContext }
  | { ok: false; response: Response };

/**
 * Autentiserar ett anrop och ger tillbaka en klient som kör som nyckeln.
 *
 * @param scope behörigheten rutten kräver. Utelämnad = varje giltig nyckel
 *   duger, vilket bara `/api/v1/meta` gör: upptäcktsanropet ska fungera för
 *   varje nyckel, annars kan integratören inte ta reda på vad den har.
 */
export async function requireApiKey(
  request: Request,
  scope?: ApiScope
): Promise<RequireApiKeyResult> {
  const requestId = newRequestId();
  const ip = clientIp(request.headers);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createAdminClient();
  if (!url || !anonKey || !admin) {
    return {
      ok: false,
      response: apiError(
        503,
        "server_misconfigured",
        "Installationen saknar konfiguration för API:et. Kontakta den som driftar den.",
        { requestId }
      ),
    };
  }

  if (forMangaAvvisade(ip)) {
    return {
      ok: false,
      response: apiError(429, "rate_limited", "För många anrop från den här adressen. Försök igen om en stund.", {
        retryAfterSeconds: 60,
        requestId,
      }),
    };
  }

  const deps: AuthenticateDeps = {
    async findKeyByHash(hash): Promise<ApiKeyRow | null> {
      const { data, error } = await admin
        .from("api_keys")
        .select("id, name, scopes, auth_user_id, revoked_at, rate_limit_per_hour")
        .eq("key_hash", hash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ApiKeyRow | null) ?? null;
    },

    async consumeQuota(keyId, limit) {
      const { data, error } = await admin.rpc("api_consume_quota", {
        p_key_id: keyId,
        p_limit: limit,
      });
      if (error) throw new Error(error.message);
      return data !== false;
    },

    /**
     * Sessionen skapas av Supabase själv: en engångslänk för maskinkontot
     * växlas direkt mot en session. Samma väg som byråväxlingen, och av samma
     * skäl — rutten signerar inte själv, så projektets JWT-hemlighet (som kan
     * utfärda vilken roll som helst, service_role inkluderad) behöver aldrig
     * ligga i appens miljö, och lösningen fortsätter fungera den dag projektet
     * byter till asymmetriska nycklar.
     */
    async mintSession(authUserId): Promise<ApiSession | null> {
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

      // Uppdateringstoken rivs direkt. Kvar blir bara den timme långa
      // åtkomsttoken — ingen sessionshistorik ska byggas upp i kundens databas
      // av något som egentligen är ett HTTP-anrop.
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

    async markUsed(keyId, adress) {
      await admin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString(), last_used_ip: adress })
        .eq("id", keyId);
    },
  };

  /**
   * Cachen läggs runt `mintSession`, inte runt hela autentiseringen: uppslaget,
   * återkallelsekontrollen och kvoten ska köras på VARJE anrop. Det är precis
   * de tre som gör återkallelse omedelbar.
   */
  const presenteradHash = (() => {
    const header = request.headers.get("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    return token ? hashApiKey(token) : "";
  })();

  const original = deps.mintSession;
  deps.mintSession = async (authUserId) => {
    const cachad = presenteradHash ? cachadSession(presenteradHash) : null;
    if (cachad) return { access_token: cachad, expires_in: 3600, expires_at: null };
    const session = await original(authUserId);
    if (session?.access_token && presenteradHash) {
      const expiresAtMs = session.expires_at
        ? session.expires_at * 1000
        : Date.now() + session.expires_in * 1000;
      sessionCache.set(presenteradHash, { token: session.access_token, expiresAtMs });
    }
    return session;
  };

  const result = await authenticateApiKey(deps, request.headers.get("authorization"), {
    scope,
    ip,
    requestId,
  });

  if (!result.ok) {
    /**
     * 401 betyder att anropet aldrig kom fram till en giltig nyckel — saknad,
     * felformad, okänd eller återkallad. Bara de räknas mot adressen.
     */
    if (result.status === 401) raknaAvvisat(ip);
    return {
      ok: false,
      response: apiError(result.status, result.body.error, result.body.message, {
        detail: result.body.detail,
        retryAfterSeconds: result.retryAfterSeconds,
        requestId,
      }),
    };
  }

  // Anroparens egen token vidare till PostgREST. Service-nyckeln får inte
  // röras här: den hade gått förbi RLS OCH räknats som betrodd av vakten, och
  // därmed svarat 200 även på en nyckel vars scope inte räcker.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${result.accessToken}` } },
  });

  return {
    ok: true,
    ctx: { key: result.key, scopes: result.scopes, supabase, admin, requestId, ip },
  };
}

/**
 * Har anroparen ett scope? För rutter som gör olika saker beroende på
 * behörighet i stället för att neka hela anropet.
 */
export function hasScope(ctx: ApiContext, scope: ApiScope): boolean {
  return ctx.scopes.includes(scope);
}

import { bearerToken, hashApiKey, isApiKey } from "./keys";
import type { ApiScope } from "./scopes";
import { SCOPE_LABELS } from "./scopes";
import { apiErrorBody, type ApiErrorBody } from "./errors";

/**
 * Autentiseringen av en API-nyckel — logiken, utan Next och utan Supabase.
 *
 * Samma uppdelning som `src/lib/byra/exchange.ts`, och av samma skäl:
 * felkoderna och ordningen mellan kontrollerna är ett kontrakt, och ett
 * kontrakt ska gå att pröva utan att starta en webbserver.
 *
 * ORDNINGEN MELLAN KONTROLLERNA ÄR ETT BESLUT, INTE EN SLUMP:
 *
 *   1. Formkontroll. Sparar ett databasanrop per felriktat anrop och säger
 *      ingenting nytt utåt — svaret är detsamma som för en okänd nyckel.
 *   2. Uppslag på SHA-256 i ett unikt index. Ingen jämförelse i minnet, ingen
 *      tid att läcka, och en träff kräver hela strängen.
 *   3. Återkallad eller utan maskinkonto → EGEN felkod. En återkallad nyckel
 *      är ett normalt tillstånd som ägaren själv orsakat, inte ett haveri, och
 *      den som felsöker ska kunna se skillnaden.
 *   4. KVOTEN FÖRE SCOPE-KONTROLLEN. Tvärtom hade gjort scope-prövning gratis:
 *      den som håller en läsnyckel kunde annars kartlägga vilka scopes som
 *      finns genom att räkna 403 mot 200 utan att förbruka någonting.
 *   5. Scope. Svaret är 403 med ett begripligt besked om vilken behörighet som
 *      saknas.
 *   6. Sessionen för maskinkontot.
 *
 * SCOPE-KONTROLLEN HÄR ÄR HJÄLPSAMHET, INTE SKYDD. Grinden står i databasen:
 * `api_has_scope()` läser raden i varje fråga, RLS avgör vad som går att röra,
 * och vakttriggern `api_block_write()` fångar de skrivvägar RLS inte ser.
 * Kontrollen i det här lagret finns för att kunna svara `insufficient_scope`
 * med en mening i stället för ett tomt resultat eller ett policyfel. Det ska
 * stå skrivet, så att ingen senare flyttar grinden hit och tar bort den där.
 */

export type ApiKeyRow = {
  id: string;
  name: string;
  scopes: string[] | null;
  auth_user_id: string | null;
  revoked_at: string | null;
  rate_limit_per_hour: number | null;
};

export type ApiSession = {
  access_token: string;
  expires_in: number;
  expires_at: number | null;
};

export type AuthenticateDeps = {
  /** Slår upp raden på SHA-256 av nyckeln. null när ingen rad matchar. */
  findKeyByHash: (hash: string) => Promise<ApiKeyRow | null>;
  /** Räknar upp kvoten atomiskt. false när taket är passerat. */
  consumeQuota: (keyId: string, limit: number) => Promise<boolean>;
  /** Mintar en session för maskinkontot. null när den inte kunde skapas. */
  mintSession: (authUserId: string) => Promise<ApiSession | null>;
  /** Stämplar last_used_at/last_used_ip. Fel här får aldrig fälla ett giltigt anrop. */
  markUsed: (keyId: string, ip: string) => Promise<void>;
};

export type AuthenticateOk = {
  ok: true;
  key: ApiKeyRow;
  scopes: string[];
  /** Sessionen anropets databasfrågor ska köras som. */
  accessToken: string;
};

export type AuthenticateError = {
  ok: false;
  status: 401 | 403 | 429 | 503;
  body: ApiErrorBody;
  /** Sätts på 429 så rutten kan lägga Retry-After i huvudet. */
  retryAfterSeconds?: number;
};

export type AuthenticateResult = AuthenticateOk | AuthenticateError;

/** Kvoten är per timme, så nästa fönster börjar tidigast vid nästa hel timme. */
export function secondsUntilNextHour(now: Date): number {
  const next = new Date(now);
  next.setUTCMinutes(60, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

function fel(
  status: AuthenticateError["status"],
  code: Parameters<typeof apiErrorBody>[0],
  message: string,
  opts: { detail?: Record<string, unknown>; requestId?: string; retryAfterSeconds?: number } = {}
): AuthenticateError {
  return {
    ok: false,
    status,
    body: apiErrorBody(code, message, { detail: opts.detail, requestId: opts.requestId }),
    ...(opts.retryAfterSeconds ? { retryAfterSeconds: opts.retryAfterSeconds } : {}),
  };
}

export type AuthenticateOptions = {
  /** Behörigheten rutten kräver. Utelämnad = varje giltig nyckel duger. */
  scope?: ApiScope;
  /** Avsändarens adress, för `last_used_ip`. */
  ip: string;
  /** Anropets id, så felsvaret bär samma som resten av svaret. */
  requestId?: string;
  /** Injiceras i provet så kvotens Retry-After går att pröva. */
  now?: Date;
};

export async function authenticateApiKey(
  deps: AuthenticateDeps,
  authorizationHeader: string | null | undefined,
  opts: AuthenticateOptions
): Promise<AuthenticateResult> {
  const requestId = opts.requestId;
  const presented = bearerToken(authorizationHeader);

  if (!presented || !isApiKey(presented)) {
    return fel(401, "unauthorized", "Saknad eller ogiltig API-nyckel. Skicka den som Authorization: Bearer dk_live_…", {
      requestId,
    });
  }

  let row: ApiKeyRow | null;
  try {
    row = await deps.findKeyByHash(hashApiKey(presented));
  } catch {
    return fel(503, "server_misconfigured", "Nyckeln kunde inte slås upp. Försök igen.", { requestId });
  }
  if (!row) {
    return fel(401, "unauthorized", "Saknad eller ogiltig API-nyckel.", { requestId });
  }

  /**
   * `auth_user_id` är null när maskinkontot raderats i Supabase-panelen. Raden
   * finns kvar för historikens skull men öppnar ingenting — samma utfall som
   * en återkallad nyckel, och samma besked utåt.
   */
  if (row.revoked_at !== null || !row.auth_user_id) {
    return fel(401, "key_revoked", "API-nyckeln är återkallad. Skapa en ny under Inställningar → API-nycklar.", {
      requestId,
    });
  }

  const limit = row.rate_limit_per_hour ?? 600;
  let inomKvot: boolean;
  try {
    inomKvot = await deps.consumeQuota(row.id, limit);
  } catch {
    /**
     * Kvoten är ett skydd mot massuttag, inte mot förfalskade nycklar. Går
     * räknaren inte att skriva ska ett giltigt anrop ändå gå fram — annars
     * blir en tillfällig databashicka ett driftstopp för varje integration.
     */
    inomKvot = true;
  }
  if (!inomKvot) {
    const retry = secondsUntilNextHour(opts.now ?? new Date());
    return fel(429, "rate_limited", `Nyckeln har gjort sina ${limit} anrop den här timmen. Försök igen om en stund.`, {
      detail: { limit_per_hour: limit, retry_after_seconds: retry },
      retryAfterSeconds: retry,
      requestId,
    });
  }

  const scopes = row.scopes ?? [];
  if (opts.scope && !scopes.includes(opts.scope)) {
    return fel(
      403,
      "insufficient_scope",
      `Nyckeln saknar behörigheten "${SCOPE_LABELS[opts.scope]}". Skapa en nyckel med den behörigheten under Inställningar → API-nycklar.`,
      { detail: { required_scope: opts.scope, key_scopes: scopes }, requestId }
    );
  }

  let session: ApiSession | null;
  try {
    session = await deps.mintSession(row.auth_user_id);
  } catch {
    session = null;
  }
  if (!session?.access_token) {
    return fel(503, "token_unavailable", "Nyckeln är giltig men en session kunde inte skapas. Försök igen.", {
      requestId,
    });
  }

  // Sist använd och varifrån är ägarens enda kvitto på att nyckeln lever. Att
  // stämpeln misslyckas är inte skäl att neka ett giltigt anrop.
  try {
    await deps.markUsed(row.id, opts.ip);
  } catch {
    /* ignoreras med flit */
  }

  return { ok: true, key: row, scopes, accessToken: session.access_token };
}

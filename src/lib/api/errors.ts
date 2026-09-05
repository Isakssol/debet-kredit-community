/**
 * Felformatet för hela API:et — ett svar, en form, för alltid.
 *
 * Tre olika former användes innan den här filen fanns: maskinkod ensam i
 * `error` (stats-rutterna), `{ error, detail }` med råtext ur databasen
 * (samma rutter vid 500) och `{ error, message }`. Den sista är den rätta och
 * låg redan i produktion mot byråportalen (`src/lib/byra/exchange.ts`). Den
 * generaliseras här.
 *
 * FYRA REGLER, OCH DEN FÖRSTA ÄR ETT LÖFTE:
 *
 *  1. `error` är en MASKINKOD i snake_case, engelsk, stabil för alltid. Nya
 *     koder får tillkomma; en befintlig kod byter aldrig betydelse. Det är
 *     den enda delen av svaret en integration får grena på.
 *  2. `message` är svenska, riktad till människan som felsöker. Den får
 *     formuleras om när som helst och är aldrig en del av kontraktet. Just
 *     därför måste den finnas: en maskinkod utan mening tvingar läsaren till
 *     dokumentationen för varje fel.
 *  3. `detail` är valfritt och STRUKTURERAT — ett objekt, aldrig en råtext ur
 *     databasen. Ett databasfel som läcker ut i klartext berättar om
 *     tabellnamn och villkor för den som inte ska veta.
 *  4. `request_id` följer med i både kropp och svarshuvudet `X-Request-Id`, så
 *     ett supportärende går att peka mot rätt rad i loggen i stället för att
 *     återskapas.
 *
 * BEFINTLIGA KODER BEHÅLLS ORDAGRANT. `unauthorized`, `key_revoked`,
 * `no_access`, `rate_limited`, `server_misconfigured`, `token_unavailable`,
 * `db_error` och `method_not_allowed` betyder exakt vad de betydde innan.
 * Enhetligheten införs genom att `message` LÄGGS TILL där den saknades —
 * aldrig genom att `error` byter innehåll. Byråportalen läser flera av dem,
 * och det kontraktet är fryst.
 */

import { NextResponse } from "next/server";

/**
 * Statuskoderna bär betydelse, och betydelsen är densamma på varje rutt:
 *
 *   400 formen — kroppen eller en parameter går inte att läsa
 *   401 nyckeln — saknas, är felformad, okänd eller återkallad
 *   403 scopet — nyckeln är giltig men får inte det här
 *   404 resursen
 *   409 idempotenskrock — samma huvud, annan kropp
 *   422 mottagen men inte behandlingsbar (se språkregeln nedan)
 *   429 takten
 *   5xx vår sida
 *
 * OM 422 OCH SPRÅKET. En faktura som inte går att bokföra i en låst period
 * får 422 och LIGGER KVAR som utkast. Det är inte "anropet misslyckades" utan
 * "fakturan är mottagen och sparad, men kunde inte bokföras" — den som
 * integrerar ska visa skälet för sin användare, inte försöka igen. Spärren är
 * en egenskap hos ett bokföringsprogram, inte en brist i API:et, och svaret
 * säger vilken spärr som gäller.
 */
export type ApiErrorCode =
  // Ärvda, oförändrade — flera av dem läses redan av byråportalen.
  | "unauthorized"
  | "key_revoked"
  | "no_access"
  | "rate_limited"
  | "server_misconfigured"
  | "token_unavailable"
  | "db_error"
  | "method_not_allowed"
  // Nya i v1. Uppräkningen innehåller bara koder någon rutt faktiskt kan
  // svara med — en kod som står i en typ men aldrig lämnar servern är en kod
  // integratören förbereder sig på i onödan.
  | "insufficient_scope"
  | "invalid_request"
  | "idempotency_required"
  | "idempotency_conflict"
  | "payload_too_large"
  | "period_locked"
  | "unprocessable";

export type ApiErrorBody = {
  error: ApiErrorCode;
  message: string;
  detail?: Record<string, unknown>;
  request_id: string;
};

export type ApiErrorOptions = {
  /** Strukturerat, aldrig råtext ur databasen. */
  detail?: Record<string, unknown>;
  /** Sätts på 429 så anroparen vet när den får komma tillbaka. */
  retryAfterSeconds?: number;
  /** Återanvänds när ett svar redan har ett id (idempotens, vidarelämning). */
  requestId?: string;
};

/**
 * Ett id per anrop. `randomUUID` finns i Node och i edge-körtiden, och behöver
 * varken vara sorterbart eller hemligt — det ska bara gå att söka på.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/** Varje svar, även ett lyckat, är olämpligt att mellanlagra. */
export const NO_STORE = "no-store";

/** Kroppen för sig, utan Next — så kontraktet går att pröva utan webbserver. */
export function apiErrorBody(
  code: ApiErrorCode,
  message: string,
  opts: ApiErrorOptions = {}
): ApiErrorBody {
  return {
    error: code,
    message,
    ...(opts.detail ? { detail: opts.detail } : {}),
    request_id: opts.requestId ?? newRequestId(),
  };
}

/**
 * Svarshuvudena varje API-svar bär.
 *
 * `no-store` på ALLA svar, inte bara felen: ekonomiska siffror ska inte ligga
 * kvar i en mellanlagring någonstans på vägen, och ett 401 som cachas blir ett
 * 401 även efter att nyckeln rättats.
 */
export function apiHeaders(requestId: string, extra: Record<string, string> = {}) {
  return { "Cache-Control": NO_STORE, "X-Request-Id": requestId, ...extra };
}

/** Felsvaret, färdigt att returnera ur en rutt. */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  opts: ApiErrorOptions = {}
): NextResponse {
  const body = apiErrorBody(code, message, opts);
  const headers = apiHeaders(
    body.request_id,
    opts.retryAfterSeconds ? { "Retry-After": String(opts.retryAfterSeconds) } : {}
  );
  return NextResponse.json(body, { status, headers });
}

/** Det lyckade svaret, med samma huvuden. */
export function apiOk<T>(data: T, requestId: string, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: apiHeaders(requestId) });
}

/**
 * Ett kastat fel → ett svar, utan att kastets text läcker ut.
 *
 * Meddelandet loggas för oss och ersätts av en fast mening utåt. Ett
 * PostgREST-fel bär tabellnamn, kolumnnamn och ibland värden ur raden; att
 * spegla tillbaka det är att svara den som forcerar med en karta.
 */
export function apiThrown(e: unknown, requestId: string, sammanhang: string): NextResponse {
  console.error(`[api ${requestId}] ${sammanhang}:`, e);
  return apiError(500, "db_error", "Anropet kunde inte genomföras. Försök igen.", {
    requestId,
  });
}

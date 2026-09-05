import { bearerToken, hashByraKey, isByraKey } from "./keys";

/**
 * Växlingen: en byrånyckel in, en kortlivad inloggning ut.
 *
 * Poängen är vad som INTE händer. Byrån kör aldrig som service_role, och
 * ingen delad STATS_API_KEY passerar. Den token som lämnas ut är en vanlig
 * Supabase-session för ett maskinkonto utan lösenord, och allt den kommer åt
 * avgörs av RLS och av is_byra_machine()/byra_has_access(), som läser
 * byra_keys vid varje fråga (20260907000012).
 *
 * Två följder är värda att säga rakt ut:
 *
 *  * Ingen ny miljövariabel. Sessionen skapas med admin-API:t och Supabases
 *    egen signeringsnyckel, inte med projektets JWT-hemlighet. Hade rutten
 *    signerat själv hade den hemligheten — som kan utfärda vilken roll som
 *    helst, service_role inkluderad — behövt ligga i appens miljö, och
 *    lösningen hade slutat fungera den dag projektet byter till asymmetriska
 *    nycklar. Testinstallationen signerar redan med ES256.
 *
 *  * Återkallelse behöver inte vänta ut token. En utfärdad token lever sin
 *    timme, men byra_has_access() blir falsk i samma sekund revoked_at sätts,
 *    så den öppnar ingenting.
 *
 * Felkoderna är en del av kontraktet, inte formuleringar. Portalen skiljer
 * "åtkomst återkallad" (klienten drog in nyckeln — ett normalt tillstånd som
 * ska visas som just det) från "fel" (något är trasigt). Blandas de ihop ser
 * en legitim återkallelse ut som ett haveri.
 */

export type ByraKeyRow = {
  id: string;
  agency_name: string;
  scopes: string[] | null;
  auth_user_id: string | null;
  revoked_at: string | null;
};

export type ByraSession = {
  access_token: string;
  expires_in: number;
  expires_at: number | null;
};

export type ExchangeDeps = {
  /** Slår upp raden på SHA-256 av nyckeln. null när ingen rad matchar. */
  findKeyByHash: (hash: string) => Promise<ByraKeyRow | null>;
  /** Skapar en session för maskinkontot. null när sessionen inte kunde skapas. */
  mintSession: (authUserId: string) => Promise<ByraSession | null>;
  /** Stämplar last_used_at. Fel här får aldrig fälla växlingen. */
  markUsed: (keyId: string) => Promise<void>;
};

export type ExchangeOk = {
  ok: true;
  status: 200;
  body: {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    expires_at: number | null;
    scopes: string[];
    agency: string;
  };
};

export type ExchangeError = {
  ok: false;
  status: 401 | 503;
  body: { error: string; message: string };
};

export type ExchangeResult = ExchangeOk | ExchangeError;

const UNAUTHORIZED: ExchangeError = {
  ok: false,
  status: 401,
  body: { error: "unauthorized", message: "Ogiltig byrånyckel." },
};

/**
 * Egen felkod, inte "unauthorized". Portalens tillstånd atkomst_aterkallad
 * hänger på den: en klient som dragit in nyckeln ska visas som återkallad,
 * inte som trasig.
 */
const REVOKED: ExchangeError = {
  ok: false,
  status: 401,
  body: { error: "key_revoked", message: "Byrånyckeln är återkallad av klienten." },
};

const UNAVAILABLE: ExchangeError = {
  ok: false,
  status: 503,
  body: {
    error: "token_unavailable",
    message: "Nyckeln är giltig men en session kunde inte skapas. Försök igen.",
  },
};

export async function exchangeByraKey(
  deps: ExchangeDeps,
  authorizationHeader: string | null | undefined
): Promise<ExchangeResult> {
  const presented = bearerToken(authorizationHeader);

  // Formatkontrollen sparar ett databasanrop per felriktat anrop och gör
  // ingen skillnad för säkerheten — svaret är detsamma som för en okänd nyckel.
  if (!presented || !isByraKey(presented)) return UNAUTHORIZED;

  let row: ByraKeyRow | null;
  try {
    row = await deps.findKeyByHash(hashByraKey(presented));
  } catch {
    return UNAVAILABLE;
  }
  if (!row) return UNAUTHORIZED;

  // auth_user_id är null när maskinkontot raderats i Supabase-panelen. Raden
  // finns kvar för historikens skull men öppnar ingenting — samma utfall som
  // en återkallad nyckel, och samma besked till portalen.
  if (row.revoked_at !== null || !row.auth_user_id) return REVOKED;

  let session: ByraSession | null;
  try {
    session = await deps.mintSession(row.auth_user_id);
  } catch {
    return UNAVAILABLE;
  }
  if (!session?.access_token) return UNAVAILABLE;

  // Sist använd är klientens enda kvitto på att byrån faktiskt tittar. Att
  // stämpeln misslyckas är inte skäl att neka en giltig nyckel.
  try {
    await deps.markUsed(row.id);
  } catch {
    /* ignoreras med flit */
  }

  return {
    ok: true,
    status: 200,
    body: {
      access_token: session.access_token,
      token_type: "Bearer",
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      scopes: row.scopes ?? [],
      agency: row.agency_name,
    },
  };
}

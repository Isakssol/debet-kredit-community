/**
 * Tvåstegsverifieringens spärrlogik — rena funktioner, utan nät och utan
 * Supabase-klient, så den går att pröva rad för rad.
 *
 * VARFÖR SPÄRREN INTE FÅR BO I GRÄNSSNITTET. Supabase delar inloggningen i två
 * nivåer: `aal1` är "lösenordet stämde", `aal2` är "lösenordet stämde och koden
 * ur autentiseringsappen stämde". Ett konto som har slagit på
 * tvåstegsverifiering får en session på aal1 direkt efter lösenordet — den är
 * en riktig session med en riktig token, och den kan hämta data. Att bara låta
 * bli att RITA appens sidor räcker därför inte: adressen går att skriva för
 * hand, och en meny som gömmer sig är ingen spärr. Kravet sitter i proxyn, som
 * körs före varje sida.
 *
 * VARFÖR AAL LÄSES LOKALT. Proxyn gör redan `getUser()`, som frågar Supabase
 * och därmed bevisar att access-token är äkta. `aal` står som ett anspråk i
 * exakt den token. Att avkoda den mittdelen kostar ingenting och kräver inget
 * andra nätanrop — men det är också allt den här filen gör: den verifierar
 * ingen signatur och ska aldrig användas på en token som inte redan är
 * kontrollerad på annat sätt.
 *
 * FAIL CLOSED. Går token inte att läsa — trasig, avkortad, av ett format vi
 * inte känner igen — svarar `readAal` null, och `needsSecondStep` tolkar null
 * som "inte aal2". Ett konto som valt tvåstegsverifiering ska hellre få skriva
 * in koden en gång för mycket än släppas in en gång för lite.
 */

/** Sidan där kodsteget tas. Ligger under /login så utloggat läge redan släpps in. */
export const MFA_VERIFY_PATH = "/login/verifiera";

export type AalLevel = "aal1" | "aal2";

/** Så mycket vi behöver av Supabases `Factor` — resten angår inte spärren. */
export type FactorLike = { status?: string | null; factor_type?: string | null };

/** Base64url → objekt. Kastar vid skräp; anroparen fångar. */
function decodeJwtSegment(segment: string): unknown {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.length % 4 === 0
    ? base64
    : base64 + "=".repeat(4 - (base64.length % 4));
  const binary = atob(padded);
  // Anspråken kan innehålla e-postadresser med å, ä och ö. Läses de som
  // latin-1 blir JSON:en trasig, så bytesekvensen avkodas som UTF-8.
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Läser `aal`-anspråket ur en access-token.
 *
 * Returnerar null för allt som inte är en läsbar token med ett känt värde —
 * inklusive tom sträng, fel antal delar och en payload som inte är JSON.
 */
export function readAal(accessToken: string | null | undefined): AalLevel | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = decodeJwtSegment(parts[1]);
    if (!payload || typeof payload !== "object") return null;
    const aal = (payload as { aal?: unknown }).aal;
    return aal === "aal1" || aal === "aal2" ? aal : null;
  } catch {
    return null;
  }
}

/**
 * Har kontot en faktor som faktiskt är färdigkopplad?
 *
 * En påbörjad men aldrig bekräftad aktivering ligger kvar som `unverified`.
 * Den får ALDRIG räknas: kunden har ingen fungerande kod till den, och en
 * spärr på den skulle låsa ute någon som inte slagit på någonting.
 */
export function hasVerifiedFactor(
  factors: readonly FactorLike[] | null | undefined,
): boolean {
  return (factors ?? []).some((f) => f?.status === "verified");
}

/** Är adressen själva kodsteget? Den måste förbli nåbar på aal1. */
export function isVerifyPath(pathname: string): boolean {
  return pathname === MFA_VERIFY_PATH || pathname.startsWith(`${MFA_VERIFY_PATH}/`);
}

/**
 * Har den här sessionen ett kodsteg kvar att ta?
 *
 * Sant när kontot har en verifierad faktor och sessionen ändå står på aal1.
 * Adressen spelar ingen roll här — det här är frågan som gäller lika för en
 * sidvisning och för ett API-anrop.
 *
 * `factors` ska komma ur `getUser()`-svaret, aldrig ur kakans ögonblicksbild:
 * det förstnämnda är hämtat från Supabase i samma begäran, det sistnämnda kan
 * vara timmar gammalt.
 */
export function isSecondStepPending(
  factors: readonly FactorLike[] | null | undefined,
  accessToken: string | null | undefined,
): boolean {
  if (!hasVerifiedFactor(factors)) return false;
  return readAal(accessToken) !== "aal2";
}

/**
 * Proxyns hela beslut om tvåstegsverifiering, som en ren funktion.
 *
 *  - `"ok"`             — inget kodsteg väntar. Begäran fortsätter som vanligt.
 *  - `"verify-step"`    — skicka till kodsteget.
 *  - `"on-verify-step"` — kunden ÄR på kodsteget och ska serveras det direkt.
 *
 * Det tredje utfallet är inte en detalj. Kodsteget ligger under /login, och
 * proxyn skickar hem en inloggad användare som hamnar på en login-sida. Utan
 * ett eget svar för "står på kodsteget" skulle spärren skicka kunden till
 * /login/verifiera, login-regeln skicka henne därifrån till "/", och spärren
 * ta henne tillbaka — en oändlig slinga i webbläsaren, för ett konto som gjort
 * allting rätt. Beslutet hör därför ihop på ett ställe i stället för att vara
 * två villkor som råkar stå i rätt ordning.
 */
export type MfaGateDecision = "ok" | "verify-step" | "on-verify-step";

export function mfaGate(args: {
  factors: readonly FactorLike[] | null | undefined;
  accessToken: string | null | undefined;
  pathname: string;
}): MfaGateDecision {
  if (!isSecondStepPending(args.factors, args.accessToken)) return "ok";
  return isVerifyPath(args.pathname) ? "on-verify-step" : "verify-step";
}

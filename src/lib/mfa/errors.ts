/**
 * Vad kunden får läsa när en kod inte gick igenom.
 *
 * Ren funktion, och den bor för sig av två skäl. Det första är att texterna
 * ska gå att pröva: varje rad nedan svarar mot ett verkligt svar från
 * Supabase, och provet håller ihop dem. Det andra är tonen. Ett kodsteg är
 * det enda stället i programmet där en kund kan bli stående utanför sin egen
 * bokföring, och då avgör ordvalet om det känns som ett fel eller som ett
 * moment. Reglerna:
 *
 *  - Råtexten från Supabase visas aldrig. Den är engelsk och skriven för
 *    utvecklare ("Invalid TOTP code entered").
 *  - Skulden läggs aldrig på kunden. Koden byts var trettionde sekund, och
 *    det är den enda förklaring som behövs.
 *  - Efter några försök byter vi förklaring i stället för att upprepa oss:
 *    den vanligaste orsaken till att koden fortsätter vara fel är att
 *    telefonens klocka går isär från serverns, och det är ingenting kunden
 *    kan gissa sig till.
 *  - Ett nätverksfel säger uttryckligen att ingenting ändrades, så att ingen
 *    tror att halva aktiveringen blev av.
 */

/** Så mycket vi behöver av Supabases AuthError. */
export type MfaErrorLike = {
  message?: string | null;
  status?: number | null;
  code?: string | null;
  name?: string | null;
};

export const MFA_WRONG_CODE =
  "Koden stämde inte. Koden byts var trettionde sekund — vänta på nästa och skriv in den.";

export const MFA_CLOCK_DRIFT =
  "Koden stämde inte, och det brukar bero på att telefonens klocka gått isär från serverns. "
  + "Slå på automatisk tid i telefonens inställningar och prova igen.";

export const MFA_EXPIRED =
  "Koden hann bytas innan den skickades. Skriv in den kod som står i appen nu.";

export const MFA_RATE_LIMIT = "För många försök. Vänta en minut och prova igen.";

export const MFA_NETWORK =
  "Kunde inte nå servern. Kontrollera anslutningen och prova igen — ingenting har ändrats.";

export const MFA_SESSION_LOST =
  "Inloggningen hann gå ut. Logga in med lösenordet igen så tar vi kodsteget på nytt.";

export const MFA_ENROLL_CANCELLED =
  "Ingen fara — ingenting aktiverades. Du kan börja om när du vill.";

export const MFA_NAME_TAKEN =
  "En påbörjad aktivering ligger kvar. Ladda om sidan och börja om — den städas bort då.";

export const MFA_DISABLED_IN_PROJECT =
  "Tvåstegsverifiering är avstängd i projektets inställningar. Slå på TOTP under "
  + "Authentication → Sign In / Providers i din Supabase-panel, så går den att aktivera här.";

/**
 * Översätt ett fel från `mfa.enroll`, `mfa.challengeAndVerify` eller
 * `mfa.unenroll` till en rad som kan visas.
 *
 * `attempts` är antalet misslyckade kodförsök i rad, inklusive det här. Från
 * och med det andra byter vi till klockförklaringen — då är "vänta på nästa
 * kod" redan prövat och hjälpte inte.
 */
export function describeMfaError(
  err: MfaErrorLike | null | undefined,
  opts: { attempts?: number } = {},
): string {
  if (!err) return "";
  const msg = (err.message ?? "").toLowerCase();
  const code = (err.code ?? "").toLowerCase();
  const name = (err.name ?? "").toLowerCase();

  // Nätverket först: ett avbrutet anrop kan bära vilket meddelande som helst,
  // och det är aldrig kundens kod som är fel.
  if (name === "authretryablefetcherror"
    || /failed to fetch|networkerror|network request failed|load failed|econnreset|socket/.test(msg)) {
    return MFA_NETWORK;
  }
  if (err.status === 429 || /rate limit|too many/.test(msg) || code.includes("over_request_rate_limit")) {
    return MFA_RATE_LIMIT;
  }
  if (code === "mfa_challenge_expired" || /challenge.*(expired|not found)|expired.*challenge/.test(msg)) {
    return MFA_EXPIRED;
  }
  if (name === "authsessionmissingerror" || code === "session_not_found"
    || /session (missing|not found|expired)|auth session missing/.test(msg)) {
    return MFA_SESSION_LOST;
  }
  if (code === "mfa_factor_name_conflict" || /friendly name.*already|already exists/.test(msg)) {
    return MFA_NAME_TAKEN;
  }
  // Projektet har TOTP avstängt (lokalt är det förvalet i config.toml).
  if (code === "mfa_totp_enroll_disabled" || code === "mfa_totp_verify_disabled"
    || /mfa.*(disabled|not enabled)|totp.*disabled/.test(msg)) {
    return MFA_DISABLED_IN_PROJECT;
  }
  if (code === "mfa_verification_failed" || /invalid totp code|invalid code|verification failed/.test(msg)) {
    return (opts.attempts ?? 1) >= 2 ? MFA_CLOCK_DRIFT : MFA_WRONG_CODE;
  }
  // Okänt svar: säg det som gäller alla kodfel, inte en rå engelsk rad.
  return (opts.attempts ?? 1) >= 2 ? MFA_CLOCK_DRIFT : MFA_WRONG_CODE;
}

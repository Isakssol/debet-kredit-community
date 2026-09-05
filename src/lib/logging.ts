/**
 * Sanering av text som ska lämna sitt sammanhang.
 *
 * Community-utgåvan har ingen egen händelselogg — det finns ingen `app_logs`
 * här, och därför inget `logEvent()`. Filen heter ändå `logging.ts` och
 * funktionerna har samma namn och samma innehåll som i licensutgåvan, där de
 * bor tillsammans med loggningen. Skälet är rent praktiskt: saneringsreglerna
 * är det som avgör vad som lämnar en kunds installation, och två utgåvor som
 * saneras olika är en tyst läcka som ingen upptäcker. Ska en regel skärpas
 * ska den gå att kopiera rakt av mellan utgåvorna.
 */

/** Maska hemligheter och personuppgifter innan något sparas. */
export function sanitize(text: string): string {
  return text
    .replace(/sk-ant-[\w-]{8,}/g, "sk-ant-••••")
    .replace(/sk-[\w-]{20,}/g, "sk-••••")
    .replace(/(gh[pousr]|github_pat)_[\w-]{8,}/g, "gh-token-••••")
    .replace(/whsec_[\w]{8,}/g, "whsec_••••")
    .replace(/re_[\w]{16,}/g, "re_••••")
    .replace(/Bearer\s+[\w.\-]{12,}/gi, "Bearer ••••")
    .replace(/eyJ[\w-]{20,}\.[\w-]{10,}\.[\w-]{10,}/g, "jwt-••••")
    .replace(/\b(19|20)?(\d{6})[-+]?(\d{4})\b/g, (_m, _c, d) => `${d}-••••`); // personnummer
}

/** Mellanslag och hårt mellanslag — svenska belopp använder båda. */
const SPACE_CHARS = "\\u0020\\u00a0";
const SPACE = `[${SPACE_CHARS}]`;

/**
 * Andra saneringslagret: text som LÄMNAR installationen.
 *
 * sanitize() ovan gäller hemligheter som aldrig får ligga någonstans. Det här
 * lagret läggs ovanpå och används bara för felrapporter som postas hem till
 * debea.se: dit ska inte heller kundens egen bokföringsdata följa med, även om
 * den vore helt ofarlig i kundens egen installation.
 *
 * Skillnaden är medveten. Reglerna här är trubbiga — allt som ser ut som ett
 * belopp, ett id eller en adress maskas. De skulle göra en lokal systemlogg
 * sämre om de gällde där: ett verifikations-id är nyttigt för kunden och
 * obehövligt hos oss.
 */
export function sanitizeOutbound(text: string): string {
  return sanitize(text)
    // IBAN, svensk form: SE + 22 siffror, med eller utan gruppering
    .replace(new RegExp(`\\bSE\\d{2}(?:${SPACE}?\\d{4}){5}\\b`, "gi"), "iban-••••")
    // E-postadresser — domänen behålls, den säger något utan att peka ut någon
    .replace(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g, (_m, domain: string) => `••••@${domain}`)
    // UUID: bär verifikations-, kund- och fakturaid rakt ut ur installationen
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "uuid-••••")
    // Belopp med valuta — efter respektive före siffran
    .replace(new RegExp(`-?\\d[\\d${SPACE_CHARS}]*(?:[.,]\\d{1,2})?${SPACE}?(?:kr|SEK)\\b`, "gi"), "••• kr")
    .replace(new RegExp(`\\b(?:kr|SEK)${SPACE}?-?\\d[\\d${SPACE_CHARS}]*(?:[.,]\\d{1,2})?`, "gi"), "••• kr")
    // Bankgiro (NNN-NNNN / NNNN-NNNN) och plusgiro (NNNNNN-N / NNNNNNN-N)
    .replace(/\b\d{3,4}-\d{4}\b/g, "••••-••••")
    .replace(/\b\d{6,7}-\d\b/g, "••••-••••")
    // Sist: alla långa siffergrupper. Organisationsnumret har då redan
    // halverats av personnummerregeln ovan och blir "••••-••••" här.
    .replace(/\d{6,}/g, "••••");
}

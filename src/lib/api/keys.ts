import { createHash, randomBytes } from "node:crypto";

/**
 * API-nyckeln — formatet, hashen och engångsvisningen.
 *
 * Samma konstruktion som byrånyckeln (`src/lib/byra/keys.ts`), med ett annat
 * prefix och i en annan tabell. De två formaten är avsiktligt skilda åt:
 * `isByraKey()` avvisar redan en `dk_live_`-nyckel, och `isApiKey()` avvisar
 * en `dkb_`, så en nyckel som klistras in i fel fält får ett tydligt nej i
 * stället för ett uppslag som råkar bli tomt.
 *
 * Nyckeln är 32 slumpade byte (256 bitar) i base64url bakom prefixet. Den
 * lagras aldrig någonstans: databasen bär en SHA-256 av strängen och
 * uppslaget sker på hashen i ett unikt index. Att jämföra hashar i ett index
 * i stället för hemligheter i minnet betyder också att jämförelsen inte kan
 * läcka tid.
 *
 * SHA-256 UTAN NYCKELUTDRAGNING är rätt här och fel för lösenord. Skillnaden
 * är entropin: ett lösenord har kanske 40 bitar och måste göras dyrt att
 * gissa, den här nyckeln har 256 och kan inte gissas oavsett hur billig
 * hashen är. Samma val som personliga åtkomsttokens hos GitHub och Stripe.
 */

export const API_KEY_PREFIX = "dk_live_";

/** 32 byte base64url = 43 tecken. */
const SECRET_LENGTH = 43;
const KEY_RE = new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);

/**
 * De tecken som sparas i klartext för att kunna peka ut rätt rad. Sex av 43
 * tecken är 36 av 256 bitar; 220 bitar återstår, vilket är lika ogissningsbart
 * som 256. Nyttan är konkret: ägaren ser "dk_live_A7x2Qp" i listan och i
 * serverloggen och kan avgöra vilken integration som knackar — utan att
 * nyckeln någonsin visas igen.
 *
 * `api_keys.key_prefix` bär ett check-villkor på exakt den formen. Ändras det
 * här måste migrationen ändras i samma andetag.
 */
const PREFIX_CHARS = API_KEY_PREFIX.length + 6;

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function isApiKey(value: string): boolean {
  return KEY_RE.test(value);
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, PREFIX_CHARS);
}

/** Nyckeln visas exakt en gång, vid utfärdandet. Den går inte att få fram igen. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashApiKey(key), prefix: apiKeyPrefix(key) };
}

/**
 * Bearer-token ur ett Authorization-huvud. Tom sträng när huvudet inte är en
 * bearer.
 *
 * Nyckeln accepteras ENBART här — aldrig i en frågesträng. En nyckel i en URL
 * hamnar i varje proxylogg på vägen, i webbläsarens historik och i
 * hänvisningshuvudet till nästa sida. Att inte läsa den från `searchParams` är
 * därför inte en glömska utan hela skyddet.
 */
export function bearerToken(header: string | null | undefined): string {
  const value = header ?? "";
  if (!value.toLowerCase().startsWith("bearer ")) return "";
  return value.slice(7).trim();
}

/**
 * Avsändarens adress, som rutterna redan läser den.
 *
 * Används till två saker: räknaren för anrop som aldrig hittar en giltig
 * nyckel, och `last_used_ip` så att ägaren ser varifrån en nyckel används.
 * Taket på 64 tecken speglar kolumnens check-villkor — ett godtyckligt långt
 * `x-forwarded-for` ska inte kunna fälla en stämpling som annars hade lyckats.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const raw = forwarded ? forwarded.split(",")[0].trim() : headers.get("x-real-ip")?.trim() || "";
  return raw ? raw.slice(0, 64) : "okand";
}

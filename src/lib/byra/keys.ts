import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Byrånyckeln — formatet, hashen och engångsvisningen.
 *
 * Nyckeln är 32 slumpade byte (256 bitar) i base64url bakom ett prefix som
 * gör den igenkännbar i en logg eller ett supportärende. Den lagras aldrig,
 * någonstans: databasen bär en SHA-256 av strängen, och uppslaget sker på
 * hashen. Att jämföra hashar i ett index i stället för hemligheter i minnet
 * betyder också att jämförelsen inte kan läcka tid.
 *
 * SHA-256 utan nyckelutdragning är rätt här och fel för lösenord. Skillnaden
 * är entropin: ett lösenord har kanske 40 bitar och måste göras dyrt att
 * gissa, den här nyckeln har 256 och kan inte gissas oavsett hur billig
 * hashen är. Samma val som personliga åtkomsttokens hos GitHub och Stripe.
 */

export const BYRA_KEY_PREFIX = "dkb_";

/** 32 byte base64url = 43 tecken. */
const SECRET_LENGTH = 43;
const KEY_RE = new RegExp(`^${BYRA_KEY_PREFIX}[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);

/**
 * De tecken som sparas i klartext för att kunna peka ut rätt rad. Sex av 43
 * tecken är 36 av 256 bitar; 220 bitar återstår, vilket är lika ogissningsbart
 * som 256. Nyttan är konkret: byrån har nyckeln i sin portal och kan säga
 * "den som börjar dkb_A7x2Qp" utan att skicka hela nyckeln i ett mejl.
 */
const PREFIX_CHARS = BYRA_KEY_PREFIX.length + 6;

export function hashByraKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function isByraKey(value: string): boolean {
  return KEY_RE.test(value);
}

export function byraKeyPrefix(key: string): string {
  return key.slice(0, PREFIX_CHARS);
}

/** Nyckeln visas exakt en gång, vid utfärdandet. Den går inte att få fram igen. */
export function generateByraKey(): { key: string; hash: string; prefix: string } {
  const key = BYRA_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashByraKey(key), prefix: byraKeyPrefix(key) };
}

/** Bearer-token ur ett Authorization-huvud. Tom sträng när huvudet inte är en bearer. */
export function bearerToken(header: string | null | undefined): string {
  const value = header ?? "";
  if (!value.toLowerCase().startsWith("bearer ")) return "";
  return value.slice(7).trim();
}

/**
 * Konstant-tidsjämförelse av två hexhashar. Uppslaget i databasen sker redan
 * på hashen, men den som senare lägger till en jämförelse i minnet ska hitta
 * rätt verktyg här i stället för att skriva ===.
 */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

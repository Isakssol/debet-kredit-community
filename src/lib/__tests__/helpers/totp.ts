import { createHmac } from "node:crypto";

/**
 * En autentiseringsapp, i tjugo rader.
 *
 * VARFÖR VI SKRIVER DEN SJÄLVA. Ett skarpt prov av tvåstegsverifieringen
 * kräver någon som kan räkna ut koden — annars går flödet bara att pröva för
 * hand med en telefon, och då prövas det aldrig. Ett bibliotek till för
 * ändamålet vore ett beroende i produktionsträdet för något som bara körs i
 * prov, och RFC 6238 är i praktiken en HMAC och en modulo.
 *
 * ATT HJÄLPAREN SJÄLV ÄR RÄTT bevisas mot RFC 6238:s egna testvektorer i
 * mfa-totp-helper.test.ts. Det är hela poängen med att ha den här: om
 * hjälparen får räkna fel skulle ett grönt e2e-prov bara betyda att vår
 * felaktiga kod råkar stämma med vår felaktiga kontroll.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648) → bytes. Supabase lämnar hemligheten i det formatet. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error(`Ogiltigt base32-tecken: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export type TotpOptions = {
  /** Unix-sekunder. Förval: nu. */
  t?: number;
  /** Fönsterlängd i sekunder. TOTP:s förval, och Supabases, är 30. */
  step?: number;
  /** Antal siffror. Sex i appen; RFC:s testvektorer är åtta. */
  digits?: number;
  algorithm?: "sha1" | "sha256" | "sha512";
};

/** HOTP/TOTP över råa nyckelbytes. */
export function totpFromBytes(secret: Buffer, opts: TotpOptions = {}): string {
  const step = opts.step ?? 30;
  const digits = opts.digits ?? 6;
  const seconds = opts.t ?? Math.floor(Date.now() / 1000);
  const counter = BigInt(Math.floor(seconds / step));

  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);

  const hmac = createHmac(opts.algorithm ?? "sha1", secret).update(message).digest();
  // Dynamisk trunkering, RFC 4226 avsnitt 5.3: sista nibbeln pekar ut var de
  // fyra byten börjar, och den höga biten maskas bort så talet blir positivt.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);

  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Koden en autentiseringsapp skulle visa för den här hemligheten. */
export function totp(base32Secret: string, opts: TotpOptions = {}): string {
  return totpFromBytes(base32Decode(base32Secret), opts);
}

/** Vilket 30-sekundersfönster en tidpunkt hör till. */
export function totpWindow(seconds = Math.floor(Date.now() / 1000), step = 30): number {
  return Math.floor(seconds / step);
}

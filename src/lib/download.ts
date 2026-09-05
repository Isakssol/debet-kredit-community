/**
 * Hjälpare för nedladdningar som hämtas med fetch i stället för via en vanlig
 * `<a download>` (se components/download-button.tsx). När filen kommer som en
 * blob finns inte längre webbläsarens automatiska namngivning — namnet måste
 * plockas ur svarets Content-Disposition.
 */

/**
 * Filnamnet ur ett Content-Disposition-huvud. Rutterna skickar `filename="…"`,
 * men svenska filnamn (åäö) kan komma som `filename*=UTF-8''…` — den formen
 * vinner enligt RFC 6266 och läses därför först.
 *
 * Returnerar null när huvudet saknas eller inte bär något namn; då får
 * webbläsaren namnge filen själv, vilket är fulare men aldrig fel.
 */
export function fileNameFrom(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = /filename\*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      const decoded = decodeURIComponent(star[1].trim());
      if (decoded) return decoded;
    } catch { /* trasig procentkodning — fall tillbaka på filename */ }
  }
  const quoted = /filename="([^"]*)"/i.exec(header);
  if (quoted) return quoted[1].trim() || null;
  const bare = /filename=([^;]+)/i.exec(header);
  return bare ? (bare[1].trim().replace(/^"|"$/g, "").trim() || null) : null;
}

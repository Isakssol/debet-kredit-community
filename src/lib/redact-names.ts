/**
 * Tredje saneringslagret: NAMN.
 *
 * `sanitizeOutbound()` klarar allt som har en form — belopp, personnummer,
 * organisationsnummer, IBAN, e-post, UUID. Ett kundnamn har ingen form.
 * "Bengtssons Bageri AB" ser för en reguljär uttryck likadant ut som
 * "Kunde inte spara": bokstäver och mellanslag. Ingen mönstermatchning i
 * världen skiljer dem åt.
 *
 * Därför byter det här lagret problem: i stället för att försöka känna igen
 * *ett namn* känner det igen *ett av den här installationens namn*. Listan är
 * ändlig och känd — den står i kundens eget register — och matchningen blir
 * exakt i stället för gissad.
 *
 * Listan lämnar aldrig installationen. Den läses i webbläsaren, används för
 * att maska texten, och kastas när dialogen stängs.
 */

/** Så många namn tas med. Ett register större än så maskas på de längsta. */
export const REDACT_NAME_LIMIT = 2000;

/**
 * Kortare namn än så maskas inte.
 *
 * Övermaskning är den säkra riktningen, men inte till vilket pris som helst:
 * en kund som heter "Fel" eller "Bank" hade annars suddat ut vanliga ord i
 * varje felmeddelande och gjort rapporten obrukbar. Fyra tecken är den gräns
 * där ett registernamn slutar krocka med svensk felsökningsprosa.
 */
export const REDACT_NAME_MIN_CHARS = 4;

export const REDACT_MASK = "••••";

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * Namnen som faktiskt går att maska, längsta först.
 *
 * Ordningen är inte kosmetisk: "Bengtssons Bageri AB" måste provas före
 * "Bengtssons", annars blir resultatet "•••• Bageri AB" och halva namnet står
 * kvar.
 */
export function usableNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length < REDACT_NAME_MIN_CHARS) continue;
    const key = name.toLocaleLowerCase("sv-SE");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  out.sort((a, b) => b.length - a.length);
  return out.slice(0, REDACT_NAME_LIMIT);
}

/**
 * Bygger maskeraren. Returnerar en ren funktion så anroparen kan köra den på
 * varje fält utan att bygga om uttrycket per rad.
 *
 * Utan användbara namn returneras identiteten — då kostar lagret ingenting,
 * och anroparen behöver inte hantera fallet särskilt.
 */
export function buildNameRedactor(names: readonly string[]): (text: string) => string {
  const usable = usableNames(names);
  if (usable.length === 0) return (text) => text;

  // Gränserna är egna i stället för \b: \b räknar å, ä och ö som
  // ordgränser, så "Åkessons" hade matchat mitt inne i ett längre ord.
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${usable.map((n) => n.replace(ESCAPE, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );

  return (text: string) => (typeof text === "string" && text ? text.replace(pattern, REDACT_MASK) : text);
}

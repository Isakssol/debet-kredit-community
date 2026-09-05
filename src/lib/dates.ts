/**
 * Kalenderdatum i bokföringen.
 *
 * Ett bokföringsdatum är ett datum i kalendern, inte en tidpunkt. Skillnaden
 * spelar roll så snart datorn står i en annan tidszon än UTC — och svenska
 * datorer gör det alltid, UTC+1 på vintern och UTC+2 på sommaren.
 *
 * Det klassiska felet är att låta en Date passera via UTC på vägen till en
 * sträng:
 *
 *     new Date("2026-09-02T00:00:00")   // tolkas LOKALT → 2026-09-01T22:00Z
 *       .toISOString().slice(0, 10)     // → "2026-09-01", en dag fel
 *
 * Samma sak för "i dag": mellan midnatt och kl. 02 är UTC-datumet fortfarande
 * gårdagens, så en bokföring som görs 00:30 den 1 januari hamnar den 31
 * december — i föregående räkenskapsår, som kan vara avslutat.
 *
 * Funktionerna här räknar därför på kalenderdelarna direkt och rör aldrig UTC.
 *
 * Att förfallodagen blir rätt är inte en detalj: dröjsmålsränta löper från
 * förfallodagen (räntelagen 1975:635, 3 §) och en påminnelseavgift får tas ut
 * först när fordran är förfallen (lagen 1981:739 om ersättning för
 * inkassokostnader m.m., 2 och 4 §§). En dag för tidigt är en dag för tidigt.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Formaterar en Date som YYYY-MM-DD i lokal tid. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Dagens datum i datorns egen tidszon, YYYY-MM-DD. */
export function todayISO(): string {
  return toISODate(new Date());
}

/**
 * Lägger till (eller drar ifrån) dagar på ett YYYY-MM-DD-datum och svarar med
 * ett YYYY-MM-DD-datum. Räknar i lokal tid hela vägen, så resultatet blir
 * detsamma oavsett tidszon och påverkas inte av sommartidsomställningen.
 */
export function addDays(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) throw new Error(`Ogiltigt datum: ${date}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

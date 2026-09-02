/**
 * Hämtar ALLA rader för en fråga genom att paginera förbi PostgREST:s
 * radgräns (1000). Utan detta trunkeras stora resultatmängder tyst —
 * ödesdigert för momsrapporter och bokslutssiffror hos företag med
 * stora volymer. Frågan MÅSTE ha en stabil ordning (t.ex. .order("id"))
 * för att sidorna inte ska överlappa.
 *
 * Sidorna hämtas i vågor om WAVE parallella anrop: 18 000 rader kostar
 * tre nätverksrundor i stället för arton — skillnaden mellan en rapport
 * och en timeout på serverlösa miljöer.
 */
const PAGE = 1000;
const WAVE = 6;

export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let wave = 0; ; wave++) {
    const results = await Promise.all(
      Array.from({ length: WAVE }, (_, i) => {
        const from = (wave * WAVE + i) * PAGE;
        return query(from, from + PAGE - 1);
      })
    );
    let done = false;
    for (const { data, error } of results) {
      if (error) throw new Error(error.message);
      if (data?.length) all.push(...data);
      if (!data || data.length < PAGE) { done = true; break; }
    }
    if (done) break;
  }
  return all;
}

/**
 * GET /api/v1/verifikat — affärshändelserna, med raderna inbakade.
 *
 *   Authorization: Bearer dk_live_…        (behörighet: data:read)
 *   ?from=&to=&serie=&konto=&id=&limit=&cursor=
 *   → 200 { data: [ { …verifikat, rows: [...] } ], next_cursor, has_more }
 *
 * VARFÖR RUTTEN FINNS. Att kunna läsa affärshändelser var den enda riktiga
 * luckan i API:et — allt som fanns var aggregat. En integration som ska stämma
 * av, arkivera eller bygga en egen rapport behöver raderna, inte summorna.
 *
 * RUTTEN LÄSER SOM NYCKELN, INTE SOM SERVICE. Det är skillnaden mot
 * stats-rutterna, och den är avsiktlig: här lämnas affärshändelser ut rad för
 * rad, och då ska RLS avgöra vad som syns. En nyckel utan `data:read` får
 * ingenting — inte därför att den här filen kontrollerar det, utan därför att
 * spärren "api laser" kräver scopet i varje fråga. Kontrollen i lagret ovanför
 * finns för att kunna svara 403 med en mening i stället för en tom lista.
 *
 * SORTERINGEN ÄR (datum, id) STIGANDE och det är en del av kontraktet:
 * markörsidindelningen bygger på den. Ändras ordningen slutar sparade markörer
 * peka rätt.
 */
import { type NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { apiError, apiOk, apiThrown } from "@/lib/api/errors";
import { encodeCursor, parseVerifikatParams } from "@/lib/api/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Kolumnerna räknas upp. `select("*")` hade tagit med framtida kolumner utan
 * beslut — och en kolumn som tillkommer i en migration ska inte lämna
 * installationen bara för att den finns.
 *
 * `!inner` sätts när det filtreras på den inbäddade tabellen. Ett filter på en
 * inbäddad tabell begränsar som förval bara VAD SOM BÄDDAS IN, inte vilka
 * verifikat som kommer med: utan `!inner` hade `?konto=3001` svarat med varje
 * verifikat i intervallet, de allra flesta med en tom rows-lista, och en
 * integration som räknar poster hade fått fel svar utan att något sagt ifrån.
 */
function selectFor(filtreraSerie: boolean, filtreraKonto: boolean): string {
  return [
    "id, number, verification_date, description, counterparty, source",
    "corrects_id, corrected_by_id",
    `verification_series${filtreraSerie ? "!inner" : ""}(code)`,
    `verification_rows${filtreraKonto ? "!inner" : ""}(row_no, account, debit, credit, note)`,
  ].join(", ");
}

type Rad = {
  row_no: number;
  account: number;
  debit: string | number;
  credit: string | number;
  note: string | null;
};

type Verifikat = {
  id: string;
  number: number;
  verification_date: string;
  description: string;
  counterparty: string | null;
  source: string;
  corrects_id: string | null;
  corrected_by_id: string | null;
  verification_series: { code: string } | null;
  verification_rows: Rad[];
};

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request, "data:read");
  if (!auth.ok) return auth.response;
  const { supabase, requestId } = auth.ctx;

  const parsed = parseVerifikatParams(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return apiError(400, "invalid_request", parsed.message, {
      detail: { field: parsed.field },
      requestId,
    });
  }
  const p = parsed.params;

  try {
    let q = supabase
      .from("verifications")
      .select(selectFor(Boolean(p.serie), Boolean(p.konto)))
      .order("verification_date", { ascending: true })
      .order("id", { ascending: true })
      // En rad extra: finns den vet vi att det finns mer, utan en andra fråga
      // som räknar. En count över hela huvudboken per sida är dyrt och säger
      // ingenting anroparen behöver.
      .limit(p.limit + 1);

    if (p.id) q = q.eq("id", p.id);
    if (p.from) q = q.gte("verification_date", p.from);
    if (p.to) q = q.lte("verification_date", p.to);
    if (p.serie) q = q.eq("verification_series.code", p.serie);
    if (p.konto) q = q.eq("verification_rows.account", p.konto);

    /**
     * Markören som villkor: allt EFTER (datum, id). Skrivs som "senare datum,
     * ELLER samma datum med större id" — annars tappas de verifikat som delar
     * datum med det sista på föregående sida, och en dag med fler verifikat än
     * en sidstorlek hade blivit delvis osynlig.
     */
    if (p.cursor) {
      q = q.or(
        `verification_date.gt.${p.cursor.date},and(verification_date.eq.${p.cursor.date},id.gt.${p.cursor.id})`
      );
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rader = (data ?? []) as unknown as Verifikat[];
    const harMer = rader.length > p.limit;
    const sidan = harMer ? rader.slice(0, p.limit) : rader;

    const ut = sidan.map((v) => ({
      id: v.id,
      number: v.number,
      series: v.verification_series?.code ?? null,
      verification_date: v.verification_date,
      description: v.description,
      counterparty: v.counterparty,
      source: v.source,
      /**
       * Rättelsekedjan följer med. Ett verifikat som rättats är fortfarande
       * kvar — oföränderligheten är hela poängen — och en integration som inte
       * ser att det är rättat räknar det två gånger.
       */
      corrects_id: v.corrects_id,
      corrected_by_id: v.corrected_by_id,
      // Beloppen kommer som numeric ur PostgREST, alltså strängar. Ett tal ut
      // är vad en integratör väntar sig; en sträng blir tyst
      // strängkonkatenering i halva världens språk.
      rows: [...(v.verification_rows ?? [])]
        .sort((a, b) => a.row_no - b.row_no)
        .map((r) => ({
          row_no: r.row_no,
          account: r.account,
          debit: Number(r.debit),
          credit: Number(r.credit),
          note: r.note,
        })),
    }));

    const sist = sidan.at(-1);
    return apiOk(
      {
        data: ut,
        next_cursor:
          harMer && sist ? encodeCursor({ date: sist.verification_date, id: sist.id }) : null,
        has_more: harMer,
      },
      requestId
    );
  } catch (e) {
    return apiThrown(e, requestId, "verifikat");
  }
}

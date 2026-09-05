/**
 * Parametrarna på läsrutterna — prövning och sidindelning, utan Next.
 *
 * MARKÖR OCH INTE SIDNUMMER. `?page=3` är fel verktyg för en huvudbok som
 * växer under tiden man läser den: läggs ett verifikat till mellan sida 2 och
 * 3 hoppar en post över kanten och syns aldrig, och tas ett bort kommer en
 * post två gånger. En markör pekar på DEN SISTA RADEN man såg, och nästa sida
 * är per definition det som kommer efter den — oavsett vad som hänt runt
 * omkring.
 *
 * Markören är (datum, id) base64url-kodad. Kodningen är inte ett skydd; den
 * finns för att markören ska se ut som en ogenomskinlig sträng så att ingen
 * bygger logik på dess innehåll och blir beroende av vår sorteringsordning.
 * Innehållet är ändå bara ett datum och ett id anroparen just fått i svaret.
 */

export type CursorPosition = { date: string; id: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(pos: CursorPosition): string {
  return Buffer.from(`${pos.date}|${pos.id}`, "utf8").toString("base64url");
}

/** null när markören inte går att läsa — anroparen ska få 400, inte sida ett. */
export function decodeCursor(raw: string): CursorPosition | null {
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const delar = text.split("|");
  if (delar.length !== 2) return null;
  const [date, id] = delar;
  /**
   * `parseDate` och inte bara formkontrollen: markörens datum går rakt in i
   * ett databasvillkor som en datumliteral. Ett 2026-13-45 som bara prövats
   * mot regexen hade tagit sig hela vägen dit och avvisats av Postgres i
   * stället för av oss — alltså ett 500 där anroparen skulle haft ett 400 som
   * säger vilken parameter som är fel.
   */
  if (parseDate(date) === null || !UUID_RE.test(id)) return null;
  return { date, id };
}

/**
 * Ett datum som både har rätt form OCH finns i kalendern.
 *
 * Formkontrollen ensam släpper igenom 2026-02-30, som JavaScript tyst rullar
 * fram till 1 mars. Ett intervall som börjar en dag som inte finns ger svar
 * för fel dagar utan att någonsin säga ifrån — därför jämförs den tolkade
 * datumsträngen tillbaka mot indata. Samma kontroll som /api/stats/daily gör.
 */
export function parseDate(value: string | null): string | null {
  if (!value || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === value ? value : null;
}

export const LIMIT_DEFAULT = 50;
export const LIMIT_MAX = 200;

export type LasParametrar = {
  from: string | null;
  to: string | null;
  serie: string | null;
  konto: number | null;
  id: string | null;
  limit: number;
  cursor: CursorPosition | null;
};

export type ParametrarResultat =
  | { ok: true; params: LasParametrar }
  | { ok: false; field: string; message: string };

/**
 * Läser och prövar frågesträngen.
 *
 * Varje avvisande namnger FÄLTET. Ett "ogiltig parameter" utan att säga
 * vilken tvingar integratören att prova sig fram, och den som provar sig fram
 * mot ett API i produktion provar mot riktiga siffror.
 */
export function parseVerifikatParams(sp: URLSearchParams): ParametrarResultat {
  const raRad = (n: string) => {
    const v = sp.get(n);
    return v === null || v.trim() === "" ? null : v.trim();
  };

  const fromRaw = raRad("from");
  const from = fromRaw === null ? null : parseDate(fromRaw);
  if (fromRaw !== null && from === null) {
    return { ok: false, field: "from", message: "from ska vara ett datum på formen ÅÅÅÅ-MM-DD." };
  }

  const toRaw = raRad("to");
  const to = toRaw === null ? null : parseDate(toRaw);
  if (toRaw !== null && to === null) {
    return { ok: false, field: "to", message: "to ska vara ett datum på formen ÅÅÅÅ-MM-DD." };
  }

  if (from && to && to < from) {
    return { ok: false, field: "to", message: "to måste vara samma dag som from eller senare." };
  }

  const idRaw = raRad("id");
  if (idRaw !== null && !UUID_RE.test(idRaw)) {
    return { ok: false, field: "id", message: "id ska vara ett verifikats uuid." };
  }

  const kontoRaw = raRad("konto");
  let konto: number | null = null;
  if (kontoRaw !== null) {
    konto = Number(kontoRaw);
    if (!Number.isInteger(konto) || konto < 1000 || konto > 9999) {
      return { ok: false, field: "konto", message: "konto ska vara ett kontonummer mellan 1000 och 9999." };
    }
  }

  const limitRaw = raRad("limit");
  let limit = LIMIT_DEFAULT;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) {
      return { ok: false, field: "limit", message: `limit ska vara ett heltal mellan 1 och ${LIMIT_MAX}.` };
    }
  }

  const cursorRaw = raRad("cursor");
  const cursor = cursorRaw === null ? null : decodeCursor(cursorRaw);
  if (cursorRaw !== null && cursor === null) {
    return {
      ok: false,
      field: "cursor",
      message: "cursor går inte att läsa. Skicka tillbaka värdet ur föregående svars next_cursor oförändrat.",
    };
  }

  const serie = raRad("serie");
  if (serie !== null && !/^[A-Za-zÅÄÖåäö0-9]{1,8}$/.test(serie)) {
    return { ok: false, field: "serie", message: "serie ska vara en verifikationsseries kod, till exempel A." };
  }

  return { ok: true, params: { from, to, serie, konto, id: idRaw, limit, cursor } };
}

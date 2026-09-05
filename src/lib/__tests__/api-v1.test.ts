import { describe, expect, test } from "vitest";
import {
  LIMIT_MAX,
  decodeCursor,
  encodeCursor,
  parseDate,
  parseVerifikatParams,
} from "../api/query";
import {
  beslutaIdempotens,
  hashRequestBody,
  laesIdempotencyKey,
  type IdempotencyDeps,
  type SparatSvar,
} from "../api/idempotency";
import { sistaDagenIManaden, sistaLastaDagen } from "@/app/api/v1/meta/route";

const sp = (q: string) => new URLSearchParams(q);

// ==========================================================================
// Markörsidindelning
// ==========================================================================

describe("markören", () => {
  test("går att koda och läsa tillbaka", () => {
    const pos = { date: "2026-03-12", id: "8f14e45f-ceea-467a-9a3a-1f2b3c4d5e6f" };
    expect(decodeCursor(encodeCursor(pos))).toEqual(pos);
  });

  test("är ogenomskinlig — inte ett datum någon kan bygga logik på", () => {
    const kodad = encodeCursor({ date: "2026-03-12", id: "8f14e45f-ceea-467a-9a3a-1f2b3c4d5e6f" });
    expect(kodad).not.toContain("2026-03-12");
    expect(kodad).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test.each([
    ["", "tom"],
    ["inte-base64!!", "inte base64url"],
    [Buffer.from("bara-ett-datum").toString("base64url"), "saknar avdelare"],
    [Buffer.from("2026-13-45|8f14e45f-ceea-467a-9a3a-1f2b3c4d5e6f").toString("base64url"), "omöjligt datum"],
    [Buffer.from("2026-03-12|inte-ett-uuid").toString("base64url"), "id är inget uuid"],
    [Buffer.from("2026-03-12|a|b").toString("base64url"), "för många delar"],
  ])("avvisar %s (%s)", (kandidat) => {
    expect(decodeCursor(kandidat)).toBeNull();
  });
});

// ==========================================================================
// Datum
// ==========================================================================

describe("datumprövningen", () => {
  test("godtar riktiga datum", () => {
    expect(parseDate("2026-03-12")).toBe("2026-03-12");
    expect(parseDate("2028-02-29")).toBe("2028-02-29"); // skottår
  });

  test("avvisar datum som inte finns i kalendern", () => {
    // Formkontrollen ensam släpper igenom 2026-02-30, som JavaScript tyst
    // rullar fram till 1 mars — och då svarar API:et för fel dagar utan att
    // någonsin säga ifrån.
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("2027-02-29")).toBeNull(); // inte skottår
  });

  test.each(["", "2026-3-12", "12/03/2026", "2026-03-12T10:00:00Z", "igår"])(
    "avvisar %s",
    (kandidat) => expect(parseDate(kandidat)).toBeNull()
  );
});

// ==========================================================================
// Parametrarna på /api/v1/verifikat
// ==========================================================================

describe("parametrarna på verifikatrutten", () => {
  test("utan parametrar gäller förvalen", () => {
    const r = parseVerifikatParams(sp(""));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params.limit).toBe(50);
    expect(r.params.from).toBeNull();
    expect(r.params.cursor).toBeNull();
  });

  test("läser ett fullständigt filter", () => {
    const cursor = encodeCursor({ date: "2026-03-01", id: "8f14e45f-ceea-467a-9a3a-1f2b3c4d5e6f" });
    const r = parseVerifikatParams(
      sp(`from=2026-01-01&to=2026-03-31&serie=A&konto=3001&limit=200&cursor=${cursor}`)
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params).toMatchObject({
      from: "2026-01-01", to: "2026-03-31", serie: "A", konto: 3001, limit: 200,
    });
    expect(r.params.cursor?.date).toBe("2026-03-01");
  });

  test("tomma parametrar behandlas som utelämnade", () => {
    // ?from=&to= är vad en klient som bygger sin URL av ett tomt formulär
    // skickar. Att avvisa det hade varit tekniskt rätt och praktiskt uselt.
    const r = parseVerifikatParams(sp("from=&to=&serie=&konto="));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params.from).toBeNull();
  });

  test.each([
    ["from=2026-02-30", "from", "datum som inte finns"],
    ["to=igår", "to", "datum som inte går att läsa"],
    ["from=2026-03-31&to=2026-01-01", "to", "intervall som går baklänges"],
    ["konto=42", "konto", "kontonummer utanför kontoplanen"],
    ["konto=abc", "konto", "konto som inte är ett tal"],
    ["limit=0", "limit", "limit under ett"],
    [`limit=${LIMIT_MAX + 1}`, "limit", "limit över taket"],
    ["limit=1.5", "limit", "limit som inte är ett heltal"],
    ["id=123", "id", "id som inte är ett uuid"],
    ["cursor=trasig!!", "cursor", "markör som inte går att läsa"],
    ["serie=A B C", "serie", "serie med blanksteg"],
  ])("avvisar %s och namnger fältet %s (%s)", (query, field) => {
    const r = parseVerifikatParams(sp(query));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Ett "ogiltig parameter" utan att säga vilken tvingar integratören att
    // prova sig fram — mot riktiga siffror, i produktion.
    expect(r.field).toBe(field);
    expect(r.message.length).toBeGreaterThan(10);
  });

  test("samma dag i from och to är ett giltigt intervall", () => {
    const r = parseVerifikatParams(sp("from=2026-03-12&to=2026-03-12"));
    expect(r.ok).toBe(true);
  });

  test("taket är 200 och det går att be om exakt taket", () => {
    expect(parseVerifikatParams(sp(`limit=${LIMIT_MAX}`)).ok).toBe(true);
  });
});

// ==========================================================================
// Idempotens
// ==========================================================================

const KEY_ID = "11111111-1111-4111-8111-111111111111";

function idemDeps(sparat: SparatSvar | null = null) {
  const sparade: SparatSvar[] = [];
  const d: IdempotencyDeps = {
    async find() {
      return sparat;
    },
    async save(_k, _i, request_hash, response_status, response_body) {
      sparade.push({ request_hash, response_status, response_body });
    },
  };
  return { d, sparade };
}

describe("Idempotency-Key", () => {
  test("saknas huvudet svarar rutten 400 och säger exakt vad som fattas", async () => {
    const { d } = idemDeps();
    const r = await beslutaIdempotens(d, KEY_ID, null, "{}");
    expect(r.kind).toBe("fel");
    if (r.kind !== "fel") return;
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("idempotency_required");
    expect(r.body.detail?.header).toBe("Idempotency-Key");
  });

  test.each([
    ["", "tomt"],
    ["kort", "under åtta tecken"],
    ["x".repeat(256), "över 255 tecken"],
  ])("avvisar %s huvud (%s)", async (huvud) => {
    const { d } = idemDeps();
    const r = await beslutaIdempotens(d, KEY_ID, huvud, "{}");
    expect(r.kind).toBe("fel");
    if (r.kind === "fel") expect(r.body.error).toBe("idempotency_required");
  });

  test("kolumnens gränser är samma i koden som i migrationen", () => {
    // check (length(idempotency_key) between 8 and 255)
    expect(laesIdempotencyKey("x".repeat(8))).toBe("x".repeat(8));
    expect(laesIdempotencyKey("x".repeat(255))).toBe("x".repeat(255));
    expect(laesIdempotencyKey("x".repeat(7))).toBeNull();
    expect(laesIdempotencyKey("x".repeat(256))).toBeNull();
  });

  test("första gången körs anropet", async () => {
    const { d } = idemDeps(null);
    const r = await beslutaIdempotens(d, KEY_ID, "order-2026-0042", '{"a":1}');
    expect(r.kind).toBe("kor");
    if (r.kind === "kor") expect(r.requestHash).toBe(hashRequestBody('{"a":1}'));
  });

  test("samma huvud och samma kropp ger det SPARADE svaret, inte en andra faktura", async () => {
    const kropp = '{"customerId":"abc"}';
    const { d } = idemDeps({
      request_hash: hashRequestBody(kropp),
      response_status: 200,
      response_body: { id: "faktura-1" },
    });
    const r = await beslutaIdempotens(d, KEY_ID, "order-2026-0042", kropp);
    expect(r.kind).toBe("upprepning");
    if (r.kind === "upprepning") {
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ id: "faktura-1" });
    }
  });

  test("samma huvud med ANNAN kropp ger 409", async () => {
    /**
     * Det verkliga misstaget är en klient som återanvänder sitt ordernummer
     * för en annan faktura. Att tyst utföra den andra hade skapat två fakturor
     * under ett löfte om att inte göra det; att tyst svara med den första hade
     * svarat på en fråga ingen ställde.
     */
    const { d } = idemDeps({
      request_hash: hashRequestBody('{"belopp":100}'),
      response_status: 200,
      response_body: { id: "faktura-1" },
    });
    const r = await beslutaIdempotens(d, KEY_ID, "order-2026-0042", '{"belopp":999}');
    expect(r.kind).toBe("fel");
    if (r.kind !== "fel") return;
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("idempotency_conflict");
  });

  test("kroppen hashas exakt — ett blanksteg är en annan kropp", () => {
    expect(hashRequestBody('{"a":1}')).not.toBe(hashRequestBody('{"a": 1}'));
    expect(hashRequestBody('{"a":1}')).toBe(hashRequestBody('{"a":1}'));
    expect(hashRequestBody("")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("ett trasigt uppslag stoppar inte ett anrop som är i sin ordning", async () => {
    const d: IdempotencyDeps = {
      async find() { throw new Error("nere"); },
      async save() {},
    };
    const r = await beslutaIdempotens(d, KEY_ID, "order-2026-0042", "{}");
    expect(r.kind).toBe("kor");
  });

  test("felkroppen bär samma request_id som resten av svaret", async () => {
    const { d } = idemDeps();
    const r = await beslutaIdempotens(d, KEY_ID, null, "{}", "abc-123");
    expect(r.kind).toBe("fel");
    if (r.kind === "fel") expect(r.body.request_id).toBe("abc-123");
  });
});

// ==========================================================================
// Låsdatumet i /api/v1/meta
// ==========================================================================

describe("sista dagen i en månad", () => {
  test("räknas i kalendern, inte via UTC", () => {
    // Dagen ÄR svaret: det är till och med den här dagen bokföringen är
    // stängd. Ett datum som tolkas i en tidszon och skrivs ut i en annan
    // tappar en dag och flyttar låset en dag åt fel håll.
    expect(sistaDagenIManaden(2026, 1)).toBe("2026-01-31");
    expect(sistaDagenIManaden(2026, 4)).toBe("2026-04-30");
    expect(sistaDagenIManaden(2026, 12)).toBe("2026-12-31");
  });

  test("februari följer den gregorianska skottårsregeln", () => {
    expect(sistaDagenIManaden(2026, 2)).toBe("2026-02-28");
    expect(sistaDagenIManaden(2028, 2)).toBe("2028-02-29");
    expect(sistaDagenIManaden(2000, 2)).toBe("2000-02-29"); // delbart med 400
    expect(sistaDagenIManaden(1900, 2)).toBe("1900-02-28"); // helt sekel, inte 400
  });
});

const KALENDERAR = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
};

/** 2026-05-01–2027-04-30: månaderna 1–4 ligger i 2027, 5–12 i 2026. */
const BRUTET_AR = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  start_date: "2026-05-01",
  end_date: "2027-04-30",
};

describe("till och med vilket datum bokföringen är låst", () => {
  test("ingen låst period ger null, inte ett påhittat datum", () => {
    expect(sistaLastaDagen([], [KALENDERAR])).toBeNull();
  });

  test("ett kalenderår är den enkla halvan", () => {
    expect(
      sistaLastaDagen(
        [
          { fiscal_year_id: KALENDERAR.id, month: 1 },
          { fiscal_year_id: KALENDERAR.id, month: 3 },
          { fiscal_year_id: KALENDERAR.id, month: 2 },
        ],
        [KALENDERAR]
      )
    ).toBe("2026-03-31");
  });

  test("ett BRUTET räkenskapsår avgör vilket år månaden tillhör", () => {
    /**
     * Den här utgåvans period_locks bär ett månadsNUMMER, inte ett datum.
     * Månad 3 i räkenskapsåret 2026-05-01–2027-04-30 är mars 2027, inte mars
     * 2026 — ett år fel, och felet pekar åt det håll som får en integratör
     * att tro att en öppen period är stängd.
     */
    expect(sistaLastaDagen([{ fiscal_year_id: BRUTET_AR.id, month: 3 }], [BRUTET_AR]))
      .toBe("2027-03-31");
    // Månad 5 är startmånaden och ligger alltså i startåret.
    expect(sistaLastaDagen([{ fiscal_year_id: BRUTET_AR.id, month: 5 }], [BRUTET_AR]))
      .toBe("2026-05-31");
  });

  test("senaste låsta datumet vinner tvärs över räkenskapsår", () => {
    expect(
      sistaLastaDagen(
        [
          { fiscal_year_id: KALENDERAR.id, month: 12 },
          { fiscal_year_id: BRUTET_AR.id, month: 2 },
        ],
        [KALENDERAR, BRUTET_AR]
      )
    ).toBe("2027-02-28");
  });

  test("skottåret följer med även genom månadsnumret", () => {
    const skottar = { id: KALENDERAR.id, start_date: "2028-01-01", end_date: "2028-12-31" };
    expect(sistaLastaDagen([{ fiscal_year_id: skottar.id, month: 2 }], [skottar]))
      .toBe("2028-02-29");
  });

  test("en lås­rad utan räkenskapsår hoppas över i stället för att gissa", () => {
    // Ett låst räkenskapsår som raderats ur listan ska inte bli ett datum ur
    // tomma luften. Att svara null är rätt: integratören ska då anta att
    // ingenting är låst och mötas av motorns eget nej om den har fel.
    expect(sistaLastaDagen([{ fiscal_year_id: "okant", month: 3 }], [KALENDERAR])).toBeNull();
  });

  test("ett omöjligt månadsnummer ger inget datum", () => {
    expect(sistaLastaDagen([{ fiscal_year_id: KALENDERAR.id, month: 0 }], [KALENDERAR])).toBeNull();
    expect(sistaLastaDagen([{ fiscal_year_id: KALENDERAR.id, month: 13 }], [KALENDERAR])).toBeNull();
  });
});

import type { ApiScope } from "./scopes";

/**
 * API-ytan som DATA — en sanning, tre läsare.
 *
 * Filen beskriver varje publik endpoint: metod, adress, behörighet,
 * parametrar, svarsform, statuskoder och takt. Den läses av
 *
 *   1. `/api/v1/meta` — installationens upptäcktsanrop,
 *   2. OpenAPI-specen (`public/openapi.json`, genererad ur `openapi.ts`),
 *   3. `golden/api-spec.golden.test.ts`, som håller de två överens med
 *      rutterna som faktiskt ligger på disk.
 *
 * VARFÖR DATA OCH INTE PROSA. Ett API som dokumenteras för hand får förr
 * eller senare tre sanningar: koden, specen och sidan. Den som glider är
 * alltid den ingen kör. Här kan de inte glida isär utan att en grind blir
 * röd — specen genereras ur den här filen, och provet jämför den med
 * rutterna.
 *
 * ============================================================
 * VAD SOM SKILJER DEN HÄR KATALOGEN FRÅN LICENSUTGÅVANS
 * ============================================================
 *
 * Katalogen speglar den här utgåvans funktionsyta, som är fryst. Tre av
 * licensutgåvans endpoints saknas därför här, och det är inte en
 * eftersläpning:
 *
 *   * `POST /api/inbound/order` — utgåvan har inget orderintag och ingen
 *     intagsjournal. Utan dem finns ingenting att ta emot i.
 *   * `POST /api/inbound/peppol` — utgåvan har ingen leverantörsinkorg för
 *     e-fakturor.
 *   * `POST /api/radgivare` — AI-rådgivaren ingår aldrig i den här utgåvan.
 *
 * Och därmed finns inte heller scopet `intake:write`: ett ord utan en väg
 * bakom sig hade stått i kryssrutan, gått att kryssa i, och inte gjort
 * någonting. Specen speglar det som finns.
 *
 * Dokumentationssidorna hör till debea.se och ligger i licensrepot. Den här
 * utgåvan lämnar ut specen (`public/openapi.json`), som varje verktyg kan
 * läsa, och README pekar på docsen.
 */

export const API_VERSION = "v1";

/**
 * KONTRAKTSVERSIONEN för v1-ytans form. Bumpas vid varje ändring som inte är
 * rent additiv — ett borttaget fält, ett omdöpt fält, en ändrad betydelse
 * eller enhet. Nya fält som en gammal läsare kan ignorera lämnar talet i fred.
 *
 * Förväxla den inte med `installation_schema_version` i `/api/v1/meta`. De
 * svarar på olika frågor och kan inte ersätta varandra:
 *
 *   schema_version              → "kan min integration läsa det här svaret?"
 *   installation_schema_version → "hur gammal är den här installationen?"
 *
 * Samma uppdelning som byråkontraktet gör, och av samma skäl: i en
 * självhostad modell kör varje kund sin egen version.
 */
export const API_SCHEMA_VERSION = 1;

export type ApiParamPlacering = "query" | "header" | "body" | "path";

export type ApiParam = {
  name: string;
  in: ApiParamPlacering;
  type: string;
  required: boolean;
  description: string;
  example?: string | number | boolean;
};

export type ApiStatusRad = {
  code: number;
  /** Maskinkoden i felkroppen. Utelämnad för lyckade svar. */
  error?: string;
  description: string;
};

export type ApiGrupp = "Upptäckt" | "Läsning" | "Skrivning" | "Byrå";

export type ApiEndpoint = {
  /** Stabilt id. Används som ankare i docsen och som operationId i specen. */
  id: string;
  method: "GET" | "POST";
  path: string;
  group: ApiGrupp;
  summary: string;
  description: string;
  /** Behörigheten rutten kräver. null = varje giltig nyckel duger. */
  scope: ApiScope | null;
  /** Miljövariabeln som fortsätter fungera parallellt, om någon. */
  legacyAuth?: string;
  params: ApiParam[];
  requestExample?: unknown;
  responseExample: unknown;
  statuses: ApiStatusRad[];
  rateLimit: string;
  /** Kräver rutten Idempotency-Key? */
  idempotency?: boolean;
  /**
   * Fryst kontrakt: får bara utökas bakåtkompatibelt, aldrig ändras.
   * Byråportalen är en separat produkt som läser dessa två.
   */
  frozen?: boolean;
};

/** Felkroppens fält, som specen beskriver. */
export const FELKROPP: ApiParam[] = [
  {
    name: "error",
    in: "body",
    type: "string",
    required: true,
    description:
      "Maskinkod i snake_case. Stabil för alltid — det här är det enda fältet en "
      + "integration ska grena på. Nya koder kan tillkomma; en befintlig kod byter "
      + "aldrig betydelse.",
    example: "insufficient_scope",
  },
  {
    name: "message",
    in: "body",
    type: "string",
    required: true,
    description:
      "Förklaring på svenska, riktad till människan som felsöker. Får formuleras om "
      + "när som helst och är aldrig en del av kontraktet.",
    example: "Nyckeln saknar behörigheten \"Bokföra\".",
  },
  {
    name: "detail",
    in: "body",
    type: "object",
    required: false,
    description:
      "Strukturerade uppgifter om just det här felet — aldrig råtext ur databasen.",
    example: '{ "required_scope": "ledger:write" }',
  },
  {
    name: "request_id",
    in: "body",
    type: "string",
    required: true,
    description:
      "Anropets id, också i svarshuvudet X-Request-Id. Ta med det i ett supportärende "
      + "så går anropet att peka ut i loggen.",
    example: "0f9c2f1e-7b3a-4c11-9d55-1a2b3c4d5e6f",
  },
];

const TAKT_STANDARD = "600 anrop per timme och nyckel (ställbart per nyckel).";
const TAKT_ARVD = "60 anrop per timme och avsändaradress.";

/**
 * Statuskoder varje nyckelskyddad rutt kan svara med. Räknas upp per endpoint
 * i stället för att antas, därför att en lista som står på ett ställe och
 * gäller överallt är en lista ingen läser vid rätt tillfälle.
 */
const AUTH_STATUSAR: ApiStatusRad[] = [
  { code: 401, error: "unauthorized", description: "Saknad, felformad eller okänd nyckel." },
  { code: 401, error: "key_revoked", description: "Nyckeln är återkallad av installationens ägare." },
  { code: 429, error: "rate_limited", description: "Nyckelns kvot för timmen är förbrukad. Retry-After säger när den återställs." },
  { code: 503, error: "server_misconfigured", description: "Installationen saknar konfiguration för API:et." },
];

const SCOPE_STATUS: ApiStatusRad = {
  code: 403,
  error: "insufficient_scope",
  description: "Nyckeln är giltig men saknar behörigheten rutten kräver.",
};

export const ENDPOINTS: ApiEndpoint[] = [
  // ---------------------------------------------------------------- Upptäckt
  {
    id: "v1-meta",
    method: "GET",
    path: "/api/v1/meta",
    group: "Upptäckt",
    summary: "Vad den här installationen är och vad din nyckel får göra",
    description:
      "I en självhostad modell kör varje kund sin egen version. Utan ett upptäcktsanrop "
      + "måste integratören gissa vad installationen kan — det här svaret säger det i "
      + "stället. Rutten kräver ingen särskild behörighet utöver en giltig nyckel, "
      + "eftersom en nyckel annars inte skulle kunna ta reda på vad den själv får göra. "
      + "Den dubbeltjänar som \"testa nyckeln\": ett 200 här betyder att nyckeln lever.\n\n"
      + "`endpoints` räknar upp precis de rutter just den här installationen har. "
      + "Utgåvorna skiljer sig åt, så läs listan i stället för att anta den.",
    scope: null,
    params: [],
    responseExample: {
      api_version: "v1",
      schema_version: 1,
      app_version: "0.1.0",
      installation_schema_version: 36,
      key: { name: "Webshoppen", scopes: ["data:read"] },
      fiscal_years: [{ year: 2026, start: "2026-01-01", end: "2026-12-31", status: "open" }],
      period_locked_to: "2026-03-31",
      vat_due_date: "2026-05-12",
      endpoints: [{ method: "GET", path: "/api/v1/verifikat", scope: "data:read" }],
    },
    statuses: [
      { code: 200, description: "Installationens uppgifter och nyckelns behörigheter." },
      ...AUTH_STATUSAR,
    ],
    rateLimit: TAKT_STANDARD,
  },

  // ---------------------------------------------------------------- Läsning
  {
    id: "v1-verifikat",
    method: "GET",
    path: "/api/v1/verifikat",
    group: "Läsning",
    summary: "Affärshändelser med sina rader",
    description:
      "Verifikat i datumordning, med raderna inbakade i varje post. Det här är den "
      + "enda vägen till affärshändelser rad för rad — övriga läsrutter svarar med "
      + "aggregat. Sidindelningen är markörbaserad: skicka tillbaka `next_cursor` för "
      + "nästa sida. En markör är stabil även om nya verifikat tillkommer under tiden, "
      + "vilket ett sidnummer inte är.\n\n"
      + "Rättelsekedjan följer med i `corrects_id` och `corrected_by_id`. Ett rättat "
      + "verifikat ligger kvar — oföränderligheten är hela poängen — och en integration "
      + "som inte ser att det är rättat räknar det två gånger.",
    scope: "data:read",
    params: [
      { name: "from", in: "query", type: "date", required: false, description: "Tidigaste verifikationsdatum (ÅÅÅÅ-MM-DD).", example: "2026-01-01" },
      { name: "to", in: "query", type: "date", required: false, description: "Senaste verifikationsdatum (ÅÅÅÅ-MM-DD).", example: "2026-03-31" },
      { name: "serie", in: "query", type: "string", required: false, description: "Verifikationsseriens kod, till exempel A eller B.", example: "A" },
      { name: "konto", in: "query", type: "integer", required: false, description: "Ta bara med verifikat som har en rad på det här kontot.", example: 3001 },
      { name: "id", in: "query", type: "uuid", required: false, description: "Hämta ett enskilt verifikat.", example: "8f14e45f-ceea-467a-9a3a-1f2b3c4d5e6f" },
      { name: "limit", in: "query", type: "integer", required: false, description: "Antal verifikat per sida, 1–200. Standard 50.", example: 50 },
      { name: "cursor", in: "query", type: "string", required: false, description: "Markören ur föregående svars `next_cursor`.", example: "MjAyNi0wMy0xMnw4ZjE0" },
    ],
    responseExample: {
      data: [
        {
          id: "8f14e45f-ceea-467a-9a3a-1f2b3c4d5e6f",
          number: 12,
          series: "B",
          verification_date: "2026-03-12",
          description: "Kundfaktura 42 — Nordisk Design AB",
          counterparty: "Nordisk Design AB",
          source: "customer_invoice",
          corrects_id: null,
          corrected_by_id: null,
          rows: [
            { row_no: 1, account: 1510, debit: 12500, credit: 0, note: null },
            { row_no: 2, account: 3001, debit: 0, credit: 10000, note: null },
            { row_no: 3, account: 2611, debit: 0, credit: 2500, note: null },
          ],
        },
      ],
      next_cursor: null,
      has_more: false,
    },
    statuses: [
      { code: 200, description: "En sida verifikat." },
      { code: 400, error: "invalid_request", description: "En parameter går inte att läsa — svaret säger vilken." },
      { code: 500, error: "db_error", description: "Underlaget kunde inte läsas." },
      SCOPE_STATUS,
      ...AUTH_STATUSAR,
    ],
    rateLimit: TAKT_STANDARD,
  },
  {
    id: "stats-overview",
    method: "GET",
    path: "/api/stats/overview",
    group: "Läsning",
    summary: "Komplett ekonomisk lägesbild",
    description:
      "Månadsresultat, tjänste- och kundfördelning, kostnad per motpart, marginaler "
      + "och underlagsstatus i ett svar. Alla belopp i SEK exklusive moms, avrundade "
      + "till hela kronor. Det här är API:ets tyngsta läsning — den går igenom "
      + "huvudboken, så anropa den med förnuft och mellanlagra på din sida.\n\n"
      + "Rutten läser med installationens service-klient och svarar med aggregat, "
      + "inte med affärshändelser. Datavägen är oförändrad sedan innan API-nycklarna "
      + "fanns; det nya är att en `dk_live_`-nyckel med `data:read` också kommer in.",
    scope: "data:read",
    legacyAuth: "STATS_API_KEY",
    params: [],
    responseExample: {
      generated_at: "2026-09-05T08:00:00.000Z",
      months: [{ month: "2026-01", revenue: 125000, costs: 61000, result: 64000 }],
      by_service: [{ service: "Konsultation", count: 12, revenue: 240000, avg_order: 20000 }],
      by_customer: [{ name: "Nordisk Design AB", count: 4, revenue: 80000 }],
      totals: { revenue: 1250000, costs: 610000, result: 640000 },
      attachments_missing: 3,
    },
    statuses: [
      { code: 200, description: "Lägesbilden." },
      SCOPE_STATUS,
      ...AUTH_STATUSAR,
      { code: 500, error: "db_error", description: "Underlaget kunde inte läsas." },
    ],
    rateLimit: TAKT_STANDARD,
  },
  {
    id: "stats-monthly",
    method: "GET",
    path: "/api/stats/monthly",
    group: "Läsning",
    summary: "Resultatserie per månad",
    description:
      "Intäkter, kostnader och resultat per månad, i SEK exklusive moms och hela "
      + "kronor. Konton 3000–7999.",
    scope: "data:read",
    legacyAuth: "STATS_API_KEY",
    params: [],
    responseExample: {
      generated_at: "2026-09-05T08:00:00.000Z",
      months: [{ month: "2026-01", revenue: 125000, costs: 61000, result: 64000 }],
      totals: { revenue: 1250000, costs: 610000, result: 640000 },
    },
    statuses: [
      { code: 200, description: "Månadsserien." },
      SCOPE_STATUS,
      ...AUTH_STATUSAR,
      { code: 500, error: "db_error", description: "Underlaget kunde inte läsas." },
    ],
    rateLimit: TAKT_STANDARD,
  },
  {
    id: "stats-daily",
    method: "GET",
    path: "/api/stats/daily",
    group: "Läsning",
    summary: "Daglig intäktsstatistik",
    description:
      "En post per kalenderdag i intervallet, även dagar utan händelser. Högst 90 "
      + "dagar per anrop. Intäkterna delas i `revenue_verkstad` och `revenue_obd`; "
      + "summan är alltid `revenue_total`, så en integration som bara vill ha "
      + "dagsomsättningen kan läsa den och strunta i uppdelningen.\n\n"
      + "`unpaid_amount` är ett ÖGONBLICKSVÄRDE — utestående kundfordringar just nu — "
      + "och upprepas därför identiskt i varje dagpost. Summera aldrig den kolumnen; "
      + "läs den ur valfri rad.",
    scope: "data:read",
    legacyAuth: "STATS_API_KEY",
    params: [
      { name: "from", in: "query", type: "date", required: true, description: "Intervallets första dag (ÅÅÅÅ-MM-DD).", example: "2026-03-01" },
      { name: "to", in: "query", type: "date", required: true, description: "Intervallets sista dag (ÅÅÅÅ-MM-DD). Högst 90 dagar från `from`.", example: "2026-03-31" },
    ],
    responseExample: [
      { date: "2026-03-01", revenue_total: 12000, revenue_verkstad: 9000, revenue_obd: 3000, invoices_count: 3, unpaid_amount: 48000 },
      { date: "2026-03-02", revenue_total: 0, revenue_verkstad: 0, revenue_obd: 0, invoices_count: 0, unpaid_amount: 48000 },
    ],
    statuses: [
      { code: 200, description: "En post per dag i intervallet. Svaret är en array, inte ett objekt." },
      { code: 400, description: "Datumen går inte att läsa, eller intervallet är längre än 90 dagar." },
      SCOPE_STATUS,
      ...AUTH_STATUSAR,
      { code: 500, error: "db_error", description: "Underlaget kunde inte läsas." },
    ],
    rateLimit: TAKT_STANDARD,
  },

  // ---------------------------------------------------------------- Skrivning
  {
    id: "v1-kundfakturor",
    method: "POST",
    path: "/api/v1/kundfakturor",
    group: "Skrivning",
    summary: "Skapa ett fakturautkast, och bokför det om du vill",
    description:
      "Tar en färdig faktura mot en KÄND kund. Rutten skapar aldrig kunder — "
      + "kundregistret är stängt för skrivning från en API-nyckel, och det står i "
      + "databasens skrivlista, inte bara i den här texten. Utkastet skrivs genom "
      + "samma väg som fakturaformuläret, med samma prövning av momssatser och "
      + "totalsumma. Med `\"book\": true` bokförs fakturan direkt: nummer, OCR och "
      + "verifikat sätts genom motorns egna funktioner.\n\n"
      + "Det betyder att periodlås, avslutade räkenskapsår, balanskravet och den "
      + "obrutna verifikationsserien gäller lika för API:et som för dig själv i "
      + "gränssnittet. Ett anrop som stoppas av ett lås får 422 med skälet utskrivet "
      + "och fakturan ligger kvar som utkast — det är en egenskap hos ett "
      + "bokföringsprogram, inte en brist i API:et.\n\n"
      + "`invoice_number` i svaret är fakturans nummer (kolumnen heter `invoice_no` i "
      + "databasen). Fältnamnet är API:ets och är detsamma i båda utgåvorna.",
    scope: "ledger:write",
    idempotency: true,
    params: [
      { name: "Idempotency-Key", in: "header", type: "string", required: true, description: "8–255 tecken som du väljer själv, unikt per faktura. Samma nyckel igen ger det sparade svaret i stället för en andra faktura.", example: "order-2026-0042" },
      { name: "customerId", in: "body", type: "uuid", required: true, description: "Kundens id. Kunden måste finnas — den här rutten skapar aldrig kunder.", example: "3c9a1b2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" },
      { name: "invoiceDate", in: "body", type: "date", required: true, description: "Fakturadatum (ÅÅÅÅ-MM-DD).", example: "2026-03-12" },
      { name: "paymentTerms", in: "body", type: "integer", required: true, description: "Betalningsvillkor i dagar, 0–90. Förfallodagen räknas i kalendern.", example: 30 },
      { name: "yourReference", in: "body", type: "string", required: false, description: "Kundens referens." },
      { name: "notes", in: "body", type: "string", required: false, description: "Fritext på fakturan." },
      { name: "rows", in: "body", type: "array", required: true, description: "Minst en rad med description, quantity, unitPrice, vatRate och account. Momssatsen ska vara 25, 12, 6 eller 0." },
      { name: "book", in: "body", type: "boolean", required: false, description: "true bokför fakturan direkt. Utelämnad eller false lämnar den som utkast.", example: false },
    ],
    requestExample: {
      customerId: "3c9a1b2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      invoiceDate: "2026-03-12",
      paymentTerms: 30,
      rows: [
        { description: "Konsultation mars", quantity: 10, unitPrice: 1000, vatRate: 25, account: 3041 },
      ],
      book: false,
    },
    responseExample: {
      id: "7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a",
      status: "draft",
      invoice_number: null,
      ocr: null,
      net_amount: 10000,
      vat_amount: 2500,
      total_amount: 12500,
      due_date: "2026-04-11",
    },
    statuses: [
      { code: 200, description: "Fakturan skapades — eller är sedan tidigare skapad med samma Idempotency-Key. Svaret bär då huvudet Idempotent-Replay." },
      { code: 400, error: "idempotency_required", description: "Huvudet Idempotency-Key saknas eller är kortare än 8 / längre än 255 tecken." },
      { code: 400, error: "invalid_request", description: "Kroppen går inte att läsa — svaret säger vilket fält." },
      { code: 409, error: "idempotency_conflict", description: "Samma Idempotency-Key har redan använts med en annan kropp." },
      { code: 413, error: "payload_too_large", description: "Kroppen är större än 512 kB. En faktura är några kilobyte; taket stoppar en kropp som inte är en." },
      { code: 422, error: "period_locked", description: "Fakturan är skapad men kunde inte bokföras: perioden är låst eller räkenskapsåret avslutat. Utkastet ligger kvar." },
      { code: 422, error: "unprocessable", description: "Fakturan är skapad men kunde inte bokföras av något annat skäl — skälet står i svaret. Utkastet ligger kvar." },
      { code: 500, error: "db_error", description: "Anropet kunde inte genomföras." },
      SCOPE_STATUS,
      ...AUTH_STATUSAR,
    ],
    rateLimit: TAKT_STANDARD,
  },

  // ---------------------------------------------------------------- Byrå
  {
    id: "byra-token",
    method: "POST",
    path: "/api/byra/token",
    group: "Byrå",
    summary: "Växla en byrånyckel mot en kortlivad inloggning",
    description:
      "Byråspåret är sitt eget och har ett annat nyckelformat (`dkb_`) i en annan "
      + "tabell. Byrån växlar sin nyckel mot en token som lever en timme och använder "
      + "den mot /api/stats/byra.\n\n"
      + "Kontraktet är FRYST. Det läses av byråportalen, som är en separat produkt, och "
      + "får bara utökas bakåtkompatibelt — aldrig ett borttaget fält, aldrig en ändrad "
      + "betydelse, aldrig en sänkt schema_version.",
    scope: null,
    frozen: true,
    params: [
      { name: "Authorization", in: "header", type: "string", required: true, description: "Bearer följt av byrånyckeln (dkb_…).", example: "Bearer dkb_…" },
    ],
    responseExample: {
      access_token: "eyJhbGciOi…",
      token_type: "Bearer",
      expires_in: 3600,
      expires_at: 1789000000,
      scopes: ["stats:read"],
      agency: "Redovisningsbyrån AB",
    },
    statuses: [
      { code: 200, description: "En token som lever en timme." },
      { code: 401, error: "unauthorized", description: "Okänd eller felformad byrånyckel." },
      { code: 401, error: "key_revoked", description: "Klienten har dragit in åtkomsten." },
      { code: 405, error: "method_not_allowed", description: "Endast POST. En token är inte en resurs som kan hämtas om." },
      { code: 429, error: "rate_limited", description: "För många växlingar från samma adress." },
      { code: 503, error: "token_unavailable", description: "Nyckeln är giltig men sessionen kunde inte skapas." },
    ],
    rateLimit: TAKT_ARVD,
  },
  {
    id: "stats-byra",
    method: "GET",
    path: "/api/stats/byra",
    group: "Byrå",
    summary: "Aggregatet en byrå får läsa",
    description:
      "En rad, inga affärshändelser: antal obokförda poster, omatchade "
      + "banktransaktioner, verifikat utan underlag, senaste verifikatdatum, låsdatum, "
      + "nästa momsdeadline och räkenskapsårets status. Inga belopp, inga motparter.\n\n"
      + "Svaret bär två versionstal som svarar på olika frågor: `schema_version` säger "
      + "om portalen kan läsa svaret, `installation_schema_version` hur gammal "
      + "installationen är. Kontraktet är FRYST.",
    scope: null,
    frozen: true,
    params: [
      { name: "Authorization", in: "header", type: "string", required: true, description: "Bearer följt av token från POST /api/byra/token.", example: "Bearer eyJhbGciOi…" },
    ],
    responseExample: {
      schema_version: 1,
      installation_schema_version: 36,
      period: "202609",
      unbooked_count: 4,
      attachments_missing: 3,
      unmatched_bank: 4,
      last_verification: "2026-09-01",
      period_locked_to: "2026-03-31",
      vat_due_date: "2026-05-12",
      fiscal_year: { start: "2026-01-01", end: "2026-12-31", status: "open" },
    },
    statuses: [
      { code: 200, description: "Aggregatet." },
      { code: 401, error: "unauthorized", description: "Saknad, felformad eller avvisad token." },
      { code: 403, error: "no_access", description: "Token duger men öppnar ingenting — åtkomsten kan vara återkallad." },
      { code: 429, error: "rate_limited", description: "För många anrop från samma adress." },
      { code: 500, error: "db_error", description: "Aggregatet kunde inte läsas." },
      { code: 503, error: "server_misconfigured", description: "Installationen saknar konfiguration för byråspåret." },
    ],
    rateLimit: TAKT_ARVD,
  },
];

/** Endpoints grupperade i den ordning referensen visar dem. */
export const GRUPPORDNING: ApiGrupp[] = ["Upptäckt", "Läsning", "Skrivning", "Byrå"];

export function endpointsByGroup(): { group: ApiGrupp; endpoints: ApiEndpoint[] }[] {
  return GRUPPORDNING.map((group) => ({
    group,
    endpoints: ENDPOINTS.filter((e) => e.group === group),
  })).filter((g) => g.endpoints.length > 0);
}

export function findEndpoint(id: string): ApiEndpoint | undefined {
  return ENDPOINTS.find((e) => e.id === id);
}

/** Den korta formen `/api/v1/meta` svarar med. */
export function endpointSummary() {
  return ENDPOINTS.map((e) => ({
    method: e.method,
    path: e.path,
    scope: e.scope,
    summary: e.summary,
  }));
}

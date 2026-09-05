import {
  API_SCHEMA_VERSION,
  API_VERSION,
  ENDPOINTS,
  FELKROPP,
  type ApiEndpoint,
  type ApiParam,
} from "./catalog";
import { API_SCOPES, SCOPE_DESCRIPTIONS, SCOPE_LABELS } from "./scopes";

/**
 * OpenAPI 3.1-specen, BYGGD UR KATALOGEN — aldrig skriven för hand.
 *
 * Fortnox referens är Swagger-genererad och därför alltid sann om formen, men
 * bara om formen: den bär inga kodexempel och inga förklaringar. Vår spec
 * genereras ur samma datafil som `/api/v1/meta`, så beskrivningarna följer med
 * in i varje verktyg som läser specen — Postman, Insomnia, en kodgenerator,
 * en agent.
 *
 * SPECEN ÄR EN AVLEDNING, INTE EN KÄLLA. `public/openapi.json` ligger
 * committad i repot så att den går att hämta utan att bygga något, men den
 * skrivs aldrig för hand: `golden/api-spec.golden.test.ts` genererar om den
 * och jämför. Specdrift knäcker bygget i stället för att upptäckas av en
 * integratör.
 *
 * SPECEN BESKRIVER DEN HÄR UTGÅVAN, INTE PRODUKTFAMILJEN. Katalogen räknar upp
 * de rutter som faktiskt ligger på disk här, och golden-provet läser
 * ruttfilerna för att hålla det sant. En endpoint som bara finns i
 * licensutgåvan står därför inte i den här specen — ett API som lovar mer än
 * installationen har är sämre än inget API alls.
 *
 * BAS-URL:EN ÄR EN VARIABEL, inte en adress. Stripe och Fortnox har en
 * bas-URL; vi har lika många som kunder. Servern skrivs därför som en
 * mall med en variabel som integratören fyller i med sin egen installation.
 */

type Json = Record<string, unknown>;

/** OpenAPI-typ ur katalogens fritextform. */
function schemaFor(param: ApiParam): Json {
  switch (param.type) {
    case "integer":
      return { type: "integer" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "array":
      return { type: "array", items: { type: "object" } };
    case "object":
      return { type: "object" };
    case "date":
      return { type: "string", format: "date" };
    case "uuid":
      return { type: "string", format: "uuid" };
    default:
      return { type: "string" };
  }
}

function felSchema(): Json {
  const properties: Json = {};
  for (const f of FELKROPP) {
    properties[f.name] = { ...schemaFor(f), description: f.description };
  }
  return {
    type: "object",
    required: FELKROPP.filter((f) => f.required).map((f) => f.name),
    properties,
  };
}

function requestBodyFor(e: ApiEndpoint): Json | null {
  const kropp = e.params.filter((p) => p.in === "body");
  if (kropp.length === 0) return null;
  const properties: Json = {};
  for (const p of kropp) {
    properties[p.name] = {
      ...schemaFor(p),
      description: p.description,
      ...(p.example !== undefined ? { example: p.example } : {}),
    };
  }
  return {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: kropp.filter((p) => p.required).map((p) => p.name),
          properties,
        },
        ...(e.requestExample !== undefined ? { example: e.requestExample } : {}),
      },
    },
  };
}

function responsesFor(e: ApiEndpoint): Json {
  const responses: Json = {};
  /**
   * Flera rader kan dela statuskod med olika felkoder — 401 är både
   * `unauthorized` och `key_revoked`. OpenAPI har en beskrivning per status, så
   * de slås ihop till en text som räknar upp koderna. Att tappa den ena hade
   * gjort specen osann om just den skillnad som är svårast att felsöka.
   */
  const perKod = new Map<number, string[]>();
  for (const s of e.statuses) {
    const text = s.error ? `\`${s.error}\` — ${s.description}` : s.description;
    perKod.set(s.code, [...(perKod.get(s.code) ?? []), text]);
  }

  for (const [code, texter] of perKod) {
    const lyckat = code >= 200 && code < 300;
    responses[String(code)] = {
      description: texter.join("\n\n"),
      content: {
        "application/json": {
          schema: lyckat ? { type: "object" } : { $ref: "#/components/schemas/Fel" },
          ...(lyckat && e.responseExample !== undefined ? { example: e.responseExample } : {}),
        },
      },
      headers: {
        "X-Request-Id": {
          description: "Anropets id. Ta med det i ett supportärende.",
          schema: { type: "string" },
        },
        ...(code === 429
          ? {
              "Retry-After": {
                description: "Sekunder tills kvoten återställs.",
                schema: { type: "integer" },
              },
            }
          : {}),
      },
    };
  }
  return responses;
}

export function buildOpenApi(appVersion: string): Json {
  const paths: Json = {};

  for (const e of ENDPOINTS) {
    const params = e.params
      .filter((p) => p.in === "query" || p.in === "header" || p.in === "path")
      // Authorization beskrivs av securitySchemes; att också räkna upp det som
      // en parameter gör att verktyg ber om det två gånger.
      .filter((p) => p.name.toLowerCase() !== "authorization")
      .map((p) => ({
        name: p.name,
        in: p.in,
        required: p.required,
        description: p.description,
        schema: schemaFor(p),
        ...(p.example !== undefined ? { example: p.example } : {}),
      }));

    const operation: Json = {
      operationId: e.id,
      summary: e.summary,
      description:
        e.description
        + `\n\n**Takt:** ${e.rateLimit}`
        + (e.scope ? `\n\n**Behörighet:** \`${e.scope}\` (${SCOPE_LABELS[e.scope]})` : "")
        + (e.legacyAuth
          ? `\n\n**Bakåtkompatibelt:** miljövariabeln \`${e.legacyAuth}\` fortsätter fungera parallellt.`
          : "")
        + (e.frozen
          ? "\n\n**Fryst kontrakt.** Läses av byråportalen och får bara utökas bakåtkompatibelt."
          : ""),
      tags: [e.group],
      ...(params.length ? { parameters: params } : {}),
      ...(requestBodyFor(e) ? { requestBody: requestBodyFor(e) } : {}),
      responses: responsesFor(e),
    };

    const nyckel = e.path;
    paths[nyckel] = { ...((paths[nyckel] as Json) ?? {}), [e.method.toLowerCase()]: operation };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Debet & Kredit API (community)",
      version: appVersion,
      summary: `API ${API_VERSION}, kontraktsversion ${API_SCHEMA_VERSION}.`,
      description: [
        "Din installation har ett eget API. Du skapar nyckeln själv under",
        "Inställningar → Åtkomst → API-nycklar, med ett klick — ingen ansökan,",
        "inget partneravtal, ingen granskning. Din server, dina nycklar.",
        "",
        "**Bas-URL.** Varje installation har sin egen adress. Byt ut",
        "`din-installation.se` mot din.",
        "",
        "**Behörigheter.** En nyckel bär en eller flera av:",
        ...API_SCOPES.map((s) => `- \`${s}\` (${SCOPE_LABELS[s]}) — ${SCOPE_DESCRIPTIONS[s]}`),
        "",
        "**Spärrarna gäller lika.** Periodlås, oföränderliga verifikat,",
        "balanskravet och avslutade räkenskapsår gäller för API:et precis som",
        "för gränssnittet. Ett anrop som stoppas av ett lås svarar 422 med",
        "skälet utskrivet — det är en egenskap hos ett bokföringsprogram, inte",
        "en begränsning i API:et.",
        "",
        "**Den här är community-utgåvan.** Funktionsytan är fryst, och specen",
        "speglar den: den beskriver de rutter installationen faktiskt har,",
        "varken fler eller färre. Anropa `GET /api/v1/meta` för att se listan",
        "från just din installation.",
      ].join("\n"),
      license: { name: "Se LICENSE i repot" },
    },
    servers: [
      {
        url: "https://{installation}",
        description: "Din egen installation.",
        variables: {
          installation: {
            default: "din-installation.se",
            description: "Adressen till din installation av Debet & Kredit.",
          },
        },
      },
    ],
    tags: [
      { name: "Upptäckt", description: "Vad installationen är och vad nyckeln får göra." },
      { name: "Läsning", description: "Hämta siffror och affärshändelser." },
      { name: "Skrivning", description: "Skapa och bokföra." },
      { name: "Byrå", description: "Byråportalens frysta kontrakt." },
    ],
    security: [{ ApiKey: [] }],
    paths,
    components: {
      securitySchemes: {
        ApiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "Nyckeln skapas under Inställningar → Åtkomst → API-nycklar och visas exakt en gång. "
            + "Skicka den som `Authorization: Bearer dk_live_…`. Aldrig i en frågesträng: "
            + "en nyckel i en URL hamnar i varje proxylogg på vägen.",
        },
      },
      schemas: { Fel: felSchema() },
    },
  };
}

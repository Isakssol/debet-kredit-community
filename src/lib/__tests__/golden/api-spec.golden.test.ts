/**
 * GOLDEN: API-specen och verkligheten.
 *
 * Fyndet som motiverar filen är inte ett fel i produkten utan en risk som
 * varje dokumenterat API bär: dokumentationen skrivs en gång och koden ändras
 * för alltid. Fortnox referens är Swagger-genererad och därför sann om formen;
 * deras taktgräns står ändå i en guide-artikel som säger 300 anrop per minut
 * medan portalens inledningstext säger något annat. Två sanningar, och den som
 * läser fel förlorar en eftermiddag.
 *
 * Här finns tre sanningar som INTE får glida isär:
 *
 *   1. `src/lib/api/catalog.ts` — vad vi påstår att API:et gör.
 *   2. `src/app/api/**\/route.ts` — vad det faktiskt gör.
 *   3. `public/openapi.json` — vad verktygen läser.
 *
 * Provet håller ihop dem genom att LÄSA RUTTFILERNA, inte genom att lita på
 * katalogen. En rutt som byter scope, eller en ny publik rutt som ingen skrev
 * ned, gör grinden röd i samma commit som ändringen.
 *
 * DET SPELAR EXTRA ROLL I DEN HÄR UTGÅVAN. Katalogen är porterad från
 * licensutgåvan, där tre endpoints till finns. Ett prov som bara läste
 * katalogen hade godkänt en spec som lovade orderintag och e-fakturaingång som
 * inte finns här — och den som integrerar hade upptäckt det i produktion.
 *
 * Specen skrivs aldrig för hand. Är den inaktuell:
 *
 *     UPPDATERA_OPENAPI=1 npx vitest run src/lib/__tests__/golden/api-spec.golden.test.ts
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENDPOINTS, GRUPPORDNING, findEndpoint } from "@/lib/api/catalog";
import { buildOpenApi } from "@/lib/api/openapi";
import { API_SCOPES } from "@/lib/api/scopes";
import { APP_VERSION } from "@/lib/app-version";

/** Specen är JSON; provet läser den som ostrukturerad data med flit. */
type Json = Record<string, unknown>;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const API_DIR = path.join(ROOT, "src", "app", "api");
const SPEC_PATH = path.join(ROOT, "public", "openapi.json");

/**
 * Rutter som med flit ligger utanför det publika API:et.
 *
 * Listan är TOM i den här utgåvan, och det är ett besked i sig: varje rutt
 * under `src/app/api` är dokumenterad. Licensutgåvans interna rutter — cron,
 * license-webhook, rådgivaren, feedback och Resends webhook för
 * leverantörsfakturor — finns inte här.
 *
 * Listan står ändå kvar, tom, därför att den är den enda platsen en framtida
 * intern rutt får skrivas in på. En ny rutt som varken står här eller i
 * katalogen fäller provet, vilket är precis vad som ska hända: `src/proxy.ts`
 * undantar `/api/` från inloggningsproxyn, så en ny rutt är öppen mot
 * internet i samma sekund den läggs till.
 */
const INTERNA: string[] = [];

/** Varje route.ts under src/app/api, som "stats/daily". */
function ruttfiler(dir = API_DIR, prefix = ""): { rutt: string; fil: string }[] {
  const ut: { rutt: string; fil: string }[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      ut.push(...ruttfiler(p, prefix ? `${prefix}/${e.name}` : e.name));
    } else if (e.name === "route.ts") {
      ut.push({ rutt: prefix, fil: p });
    }
  }
  return ut;
}

const RUTTER = ruttfiler();
const kall = (fil: string) => fs.readFileSync(fil, "utf8");

// ==========================================================================
// A. Katalogen speglar rutterna som finns på disk
// ==========================================================================

describe("katalogen och rutterna beskriver samma API", () => {
  test("sveppet hittar rutterna — annars är provet grönt av fel skäl", () => {
    // Utgåvan har åtta rutter. Tröskeln är satt under det talet med flit: den
    // ska fånga ett trasigt svep, inte hindra att en rutt tillkommer.
    expect(RUTTER.length).toBeGreaterThanOrEqual(8);
  });

  test("varje endpoint i katalogen har en rutt på disk", () => {
    const saknas = ENDPOINTS
      .filter((e) => !RUTTER.some((r) => `/api/${r.rutt}` === e.path))
      .map((e) => `${e.method} ${e.path}`);
    expect(saknas, `Katalogen lovar rutter som inte finns: ${saknas.join(", ")}`).toEqual([]);
  });

  test("varje rutt på disk är antingen dokumenterad eller uttryckligen intern", () => {
    const odokumenterade = RUTTER
      .filter((r) => !INTERNA.includes(r.rutt))
      .filter((r) => !ENDPOINTS.some((e) => e.path === `/api/${r.rutt}`))
      .map((r) => r.rutt);
    expect(
      odokumenterade,
      `Rutter som varken står i katalogen eller i INTERNA: ${odokumenterade.join(", ")}. `
        + "Proxyn undantar /api/ från inloggningen, så en ny rutt bär hela sin egen "
        + "behörighetskontroll — skriv ned den, eller markera den som intern."
    ).toEqual([]);
  });

  test("listan över interna rutter beskriver rutter som verkligen finns", () => {
    const spoken = INTERNA.filter((i) => !RUTTER.some((r) => r.rutt === i));
    expect(spoken, `INTERNA nämner rutter som inte finns: ${spoken.join(", ")}`).toEqual([]);
  });
});

// ==========================================================================
// B. Behörigheten i katalogen är den rutten faktiskt kräver
// ==========================================================================

describe("scopet i katalogen är det rutten kräver", () => {
  /** Scopet rutten skickar till requireApiKey(), läst ur källan. */
  function scopeIKallan(fil: string): string | null | undefined {
    const src = kall(fil);
    const m = /requireApiKey\(\s*request\s*(?:,\s*"([^"]+)")?\s*\)/.exec(src);
    if (!m) return undefined; // rutten kallar inte requireApiKey alls
    return m[1] ?? null;
  }

  for (const e of ENDPOINTS.filter((x) => !x.frozen)) {
    test(`${e.method} ${e.path} kräver ${e.scope ?? "ingen särskild behörighet"}`, () => {
      const rutt = RUTTER.find((r) => `/api/${r.rutt}` === e.path);
      expect(rutt, `Ingen ruttfil för ${e.path}`).toBeTruthy();

      // Stats-rutterna går via checkStatsAuth i _shared.ts, som i sin tur
      // kallar requireApiKey. Följ ett led för att hitta det verkliga scopet.
      const src = kall(rutt!.fil);
      const fil = /checkStatsAuth/.test(src)
        ? path.join(API_DIR, "stats", "_shared.ts")
        : rutt!.fil;

      expect(
        scopeIKallan(fil),
        `Katalogen säger ${e.scope}, men rutten skickar något annat till requireApiKey().`
      ).toBe(e.scope);
    });
  }

  test("byråkontraktets rutter använder MED FLIT inte api_keys", () => {
    /**
     * `dkb_` och `dk_live_` är två format i två tabeller. Skulle byråspåret
     * någon gång autentiseras genom requireApiKey() vore kontraktet inte
     * längre fryst — det hade fått api_keys felkoder och kvot, och portalen
     * läser båda.
     */
    for (const e of ENDPOINTS.filter((x) => x.frozen)) {
      const rutt = RUTTER.find((r) => `/api/${r.rutt}` === e.path)!;
      expect(kall(rutt.fil), `${e.path} har börjat använda requireApiKey`).not.toMatch(
        /requireApiKey/
      );
    }
  });

  test("varje scope i katalogen finns i vokabulären", () => {
    const okanda = ENDPOINTS
      .map((e) => e.scope)
      .filter((s) => s !== null)
      .filter((s) => !(API_SCOPES as readonly string[]).includes(s as string));
    expect(okanda, `Katalogen använder scopes som inte finns: ${okanda.join(", ")}`).toEqual([]);
  });
});

// ==========================================================================
// C. Statuskoderna i katalogen är de rutten kan svara med
// ==========================================================================

describe("statuskoderna stämmer med rutternas svar", () => {
  /** Felkoderna rutten faktiskt kan returnera, lästa ur apiError-anropen. */
  function felkoderIKallan(fil: string): Set<string> {
    const ut = new Set<string>();
    for (const m of kall(fil).matchAll(/apiError\(\s*(\d{3})\s*,\s*"([a-z_]+)"/g)) {
      ut.add(`${m[1]}:${m[2]}`);
    }
    return ut;
  }

  for (const e of ENDPOINTS.filter((x) => x.path.startsWith("/api/v1/"))) {
    test(`${e.path} dokumenterar varje felkod den kan svara med`, () => {
      const rutt = RUTTER.find((r) => `/api/${r.rutt}` === e.path)!;
      const iKallan = felkoderIKallan(rutt.fil);
      const iKatalogen = new Set(
        e.statuses.filter((s) => s.error).map((s) => `${s.code}:${s.error}`)
      );
      const odokumenterade = [...iKallan].filter((k) => !iKatalogen.has(k));
      expect(
        odokumenterade,
        `Rutten kan svara med ${odokumenterade.join(", ")} men katalogen nämner det inte. `
          + "En felkod som inte står i referensen är en felkod integratören möter först i "
          + "produktion."
      ).toEqual([]);
    });
  }

  test("katalogen lovar ingen endpoint som bara finns i licensutgåvan", () => {
    /**
     * Katalogen är porterad. De tre rutterna nedan finns i licensutgåvan och
     * inte här, och scopet `intake:write` finns inte heller. Ett direkt prov
     * på just dem säger VARFÖR de saknas — testet ovan hade sagt det med ett
     * meddelande som bara namnger en sökväg.
     */
    const bara_i_licensen = ["/api/inbound/order", "/api/inbound/peppol", "/api/radgivare"];
    const lovade = ENDPOINTS.map((e) => e.path).filter((p) => bara_i_licensen.includes(p));
    expect(
      lovade,
      "Specen beskriver rutter som inte finns i den här utgåvan. Funktionsytan är "
        + "fryst; endpointen införs i samma commit som funktionen, inte före."
    ).toEqual([]);

    const intake = ENDPOINTS.filter((e) => e.scope === ("intake:write" as unknown)).map((e) => e.path);
    expect(intake, "Scopet intake:write har ingen väg bakom sig här.").toEqual([]);
  });

  test("varje endpoint dokumenterar ett lyckat svar", () => {
    for (const e of ENDPOINTS) {
      const lyckade = e.statuses.filter((s) => s.code >= 200 && s.code < 300);
      expect(lyckade.length, `${e.path} saknar ett 2xx-svar`).toBeGreaterThan(0);
    }
  });

  test("varje nyckelskyddad endpoint dokumenterar 401", () => {
    for (const e of ENDPOINTS) {
      expect(
        e.statuses.some((s) => s.code === 401),
        `${e.path} dokumenterar inte vad som händer utan giltig nyckel`
      ).toBe(true);
    }
  });

  test("varje scopad endpoint dokumenterar 403", () => {
    for (const e of ENDPOINTS.filter((x) => x.scope !== null)) {
      expect(
        e.statuses.some((s) => s.code === 403),
        `${e.path} kräver ${e.scope} men dokumenterar inte 403`
      ).toBe(true);
    }
  });
});

// ==========================================================================
// D. Katalogen är internt hel
// ==========================================================================

describe("katalogen håller ihop", () => {
  test("id:n är unika — de är ankare i docsen och operationId i specen", () => {
    const ids = ENDPOINTS.map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
    for (const id of ids) expect(findEndpoint(id)?.id).toBe(id);
  });

  test("metod och adress är unika tillsammans", () => {
    const nycklar = ENDPOINTS.map((e) => `${e.method} ${e.path}`);
    expect(nycklar.length).toBe(new Set(nycklar).size);
  });

  test("varje grupp i katalogen står i grupporningen", () => {
    const okanda = ENDPOINTS.map((e) => e.group).filter((g) => !GRUPPORDNING.includes(g));
    expect(okanda).toEqual([]);
  });

  test("varje endpoint har en takt utskriven vid sig", () => {
    // Fortnox begraver sin i en guide-artikel. Talet ska stå där man läser om
    // rutten, inte där man letar efter det efteråt.
    for (const e of ENDPOINTS) {
      expect(e.rateLimit, `${e.path} saknar takt`).toMatch(/\d/);
    }
  });

  test("varje skrivande endpoint kräver Idempotency-Key", () => {
    for (const e of ENDPOINTS.filter((x) => x.method === "POST" && x.scope === "ledger:write")) {
      expect(e.idempotency, `${e.path} skriver i bokföringen utan idempotens`).toBe(true);
      expect(
        e.params.some((p) => p.in === "header" && p.name === "Idempotency-Key" && p.required),
        `${e.path} dokumenterar inte huvudet Idempotency-Key`
      ).toBe(true);
    }
  });

  test("obligatoriska parametrar har en beskrivning värd namnet", () => {
    for (const e of ENDPOINTS) {
      for (const p of e.params.filter((x) => x.required)) {
        expect(
          p.description.length,
          `${e.path} → ${p.name} har en beskrivning som inte säger något`
        ).toBeGreaterThan(15);
      }
    }
  });

  test("de frysta kontrakten är märkta, och bara de", () => {
    const frysta = ENDPOINTS.filter((e) => e.frozen).map((e) => e.path).sort();
    expect(
      frysta,
      "Byråportalen är en separat produkt som läser dessa två. Ändras listan ändras "
        + "vad som får brytas."
    ).toEqual(["/api/byra/token", "/api/stats/byra"]);
  });
});

// ==========================================================================
// E. Specen är en avledning av katalogen
// ==========================================================================

describe("openapi.json", () => {
  const genererad = buildOpenApi(APP_VERSION);
  const text = JSON.stringify(genererad, null, 2) + "\n";

  test("den committade specen är genererad ur katalogen", () => {
    if (process.env.UPPDATERA_OPENAPI === "1") {
      fs.mkdirSync(path.dirname(SPEC_PATH), { recursive: true });
      fs.writeFileSync(SPEC_PATH, text);
    }
    expect(fs.existsSync(SPEC_PATH), `${SPEC_PATH} saknas`).toBe(true);
    expect(
      fs.readFileSync(SPEC_PATH, "utf8"),
      "public/openapi.json är inte längre den katalogen beskriver. Kör:\n"
        + "  UPPDATERA_OPENAPI=1 npx vitest run src/lib/__tests__/golden/api-spec.golden.test.ts"
    ).toBe(text);
  });

  test("varje endpoint finns i specen med rätt metod", () => {
    const paths = genererad.paths as Record<string, Record<string, unknown>>;
    for (const e of ENDPOINTS) {
      expect(paths[e.path], `${e.path} saknas i specen`).toBeTruthy();
      expect(
        paths[e.path][e.method.toLowerCase()],
        `${e.method} ${e.path} saknas i specen`
      ).toBeTruthy();
    }
  });

  test("bas-URL:en är en variabel — vi har lika många som kunder", () => {
    const servers = genererad.servers as { url: string; variables?: Json }[];
    expect(servers[0].url).toContain("{installation}");
    expect(servers[0].variables).toBeTruthy();
  });

  test("varje svar bär X-Request-Id", () => {
    const paths = genererad.paths as Record<string, Record<string, { responses: Json }>>;
    for (const e of ENDPOINTS) {
      const responses = paths[e.path][e.method.toLowerCase()].responses as Record<string, Json>;
      for (const [kod, svar] of Object.entries(responses)) {
        const headers = (svar as { headers?: Json }).headers ?? {};
        expect(headers["X-Request-Id"], `${e.path} ${kod} saknar X-Request-Id`).toBeTruthy();
      }
    }
  });

  test("429 bär Retry-After", () => {
    const paths = genererad.paths as Record<string, Record<string, { responses: Json }>>;
    for (const e of ENDPOINTS) {
      const responses = paths[e.path][e.method.toLowerCase()].responses as Record<string, Json>;
      if (!responses["429"]) continue;
      const headers = (responses["429"] as { headers?: Json }).headers ?? {};
      expect(headers["Retry-After"], `${e.path} 429 saknar Retry-After`).toBeTruthy();
    }
  });

  test("felsvaren pekar på ett gemensamt felschema", () => {
    const paths = genererad.paths as Record<string, Record<string, { responses: Json }>>;
    for (const e of ENDPOINTS) {
      const responses = paths[e.path][e.method.toLowerCase()].responses as Record<string, Json>;
      for (const [kod, svar] of Object.entries(responses)) {
        if (Number(kod) < 400) continue;
        const schema = (svar as { content: Record<string, { schema: Json }> })
          .content["application/json"].schema;
        expect(schema["$ref"], `${e.path} ${kod} har ett eget felschema`).toBe(
          "#/components/schemas/Fel"
        );
      }
    }
  });

  test("felschemat räknar upp fälten felkroppen faktiskt bär", () => {
    const komponenter = genererad.components as { schemas: { Fel: { required: string[] } } };
    expect(komponenter.schemas.Fel.required.sort()).toEqual(
      ["error", "message", "request_id"]
    );
  });

  test("två felkoder på samma status tappas inte", () => {
    // 401 är både unauthorized och key_revoked. OpenAPI har en beskrivning per
    // status — att tappa den ena hade gjort specen osann om just den skillnad
    // som är svårast att felsöka.
    const paths = genererad.paths as Record<string, Record<string, { responses: Json }>>;
    const svar = paths["/api/v1/meta"].get.responses as Record<string, { description: string }>;
    expect(svar["401"].description).toContain("unauthorized");
    expect(svar["401"].description).toContain("key_revoked");
  });
});

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MFA_VERIFY_PATH, hasVerifiedFactor, isSecondStepPending, isVerifyPath, mfaGate, readAal,
} from "@/lib/mfa/aal";
import {
  MFA_CLOCK_DRIFT, MFA_DISABLED_IN_PROJECT, MFA_EXPIRED, MFA_NAME_TAKEN, MFA_NETWORK,
  MFA_RATE_LIMIT, MFA_SESSION_LOST, MFA_WRONG_CODE, describeMfaError,
} from "@/lib/mfa/errors";
import { formatSecret, qrCodeSrc } from "@/lib/mfa/qr";
import { config } from "../../proxy";

/**
 * Spärren som avgör om en inloggning är färdig.
 *
 * VARFÖR PROVET FINNS. Tvåstegsverifieringen har exakt ett ställe där den kan
 * gå sönder tyst: villkoret som avgör om en session får nå appen. Går det för
 * hårt låser vi ute en kund ur hennes egen bokföring. Går det för löst är hela
 * funktionen en kuliss — sessionen finns, token duger, och den enda som
 * hindrar någon är att vi låtit bli att rita menyn.
 *
 * Villkoret är därför en ren funktion, och den prövas här från båda hållen:
 * varje läge som ska släppas igenom, och varje läge som inte ska det.
 *
 * DE TVÅ FÄLLORNA SOM HAR EGNA PROV:
 *
 *  1. En OVERIFIERAD faktor får inte räknas. Den finns när någon börjat
 *     aktivera och avbrutit, och kunden har ingen kod till den. Räknade vi den
 *     skulle en avbruten aktivering låsa ute kontot permanent — och den som
 *     drabbas har inte ens slagit på funktionen.
 *  2. Kodsteget ligger under /login, och proxyn skickar hem en inloggad
 *     användare som hamnar på en login-sida. Utan ett eget svar för "står PÅ
 *     kodsteget" skulle spärren och den regeln skicka kunden fram och tillbaka
 *     i all oändlighet. Det är därför beslutet har tre utfall och inte två —
 *     och därför ett prov längre ned läser proxyns källkod och kräver att
 *     spärren står FÖRE hemskicket. Ordningen i filen är beteendet, och den
 *     kan inget prov på mfaGate ensamt se.
 *
 * Sist prövas hänvisningen till guiden. Den här utgåvan har inget hjälpcenter
 * i appen, så den enda beskrivna vägen tillbaka för den som tappat telefonen
 * är en fil i repot — och en hänvisning till en fil som inte finns går sönder
 * tyst.
 */

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const token = (payload: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.signatur`;

const AAL1 = token({ sub: "u1", aal: "aal1" });
const AAL2 = token({ sub: "u1", aal: "aal2" });

const verifierad = [{ status: "verified", factor_type: "totp" }];
const påbörjad = [{ status: "unverified", factor_type: "totp" }];

describe("readAal", () => {
  test("läser nivån ur en token", () => {
    expect(readAal(AAL1)).toBe("aal1");
    expect(readAal(AAL2)).toBe("aal2");
  });

  test("tål å, ä och ö i anspråken", () => {
    // Payloaden bär e-postadressen. Läses byten som latin-1 blir JSON:en
    // trasig, och spärren skulle svara null för en fullt giltig aal2-token —
    // alltså kräva ett kodsteg av någon som just tagit det.
    expect(readAal(token({ email: "åsa.öberg@företag.se", aal: "aal2" }))).toBe("aal2");
  });

  test.each([
    ["ingenting", undefined],
    ["tom sträng", ""],
    ["inte en token alls", "abc123"],
    ["två delar i stället för tre", "aaa.bbb"],
    ["mittdelen är inte base64", "aaa.???.ccc"],
    ["mittdelen är inte JSON", `aaa.${b64url("bara text")}.ccc`],
    ["payload utan aal", token({ sub: "u1" })],
    ["okänd nivå", token({ aal: "aal3" })],
    ["aal som tal", token({ aal: 2 })],
  ])("svarar null för %s", (_namn, värde) => {
    expect(readAal(värde as string | undefined)).toBeNull();
  });
});

describe("hasVerifiedFactor", () => {
  test.each([
    ["ingen lista", undefined, false],
    ["tom lista", [], false],
    ["bara en påbörjad aktivering", påbörjad, false],
    ["en färdig faktor", verifierad, true],
    ["en färdig bland påbörjade", [...påbörjad, ...verifierad], true],
  ])("%s → %s", (_namn, factors, väntat) => {
    expect(hasVerifiedFactor(factors as { status: string }[] | undefined)).toBe(väntat);
  });
});

describe("isSecondStepPending", () => {
  test("kontot utan faktor har ingenting att ta — oavsett token", () => {
    expect(isSecondStepPending([], AAL1)).toBe(false);
    expect(isSecondStepPending(undefined, "skräp")).toBe(false);
    expect(isSecondStepPending(påbörjad, AAL1)).toBe(false);
  });

  test("faktor + aal1 = kodsteget återstår", () => {
    expect(isSecondStepPending(verifierad, AAL1)).toBe(true);
  });

  test("faktor + aal2 = klart", () => {
    expect(isSecondStepPending(verifierad, AAL2)).toBe(false);
  });

  test("oläsbar token räknas som att steget återstår", () => {
    // Fail closed. En kund som valt tvåstegsverifiering ska hellre skriva in
    // koden en gång för mycket än släppas in en gång för lite.
    expect(isSecondStepPending(verifierad, "trasig.token")).toBe(true);
    expect(isSecondStepPending(verifierad, undefined)).toBe(true);
  });
});

describe("isVerifyPath", () => {
  test.each([MFA_VERIFY_PATH, `${MFA_VERIFY_PATH}/`, `${MFA_VERIFY_PATH}/nagot`])(
    "%s är kodsteget", (p) => expect(isVerifyPath(p)).toBe(true));

  test.each(["/login", "/login/verifieraX", "/", "/verifikat", "/installningar"])(
    "%s är det inte", (p) => expect(isVerifyPath(p)).toBe(false));
});

describe("mfaGate — proxyns beslut", () => {
  const gate = (factors: unknown, accessToken: string | undefined, pathname: string) =>
    mfaGate({ factors: factors as { status: string }[] | undefined, accessToken, pathname });

  test("konto utan tvåstegsverifiering påverkas inte av någonting", () => {
    for (const p of ["/", "/verifikat", "/installningar", MFA_VERIFY_PATH]) {
      expect(gate([], AAL1, p)).toBe("ok");
    }
  });

  test("färdig inloggning släpps fram överallt", () => {
    expect(gate(verifierad, AAL2, "/")).toBe("ok");
    expect(gate(verifierad, AAL2, "/moms")).toBe("ok");
    // …även på kodsteget: där finns inget kvar att göra, och regeln längre ned
    // i proxyn skickar hem henne.
    expect(gate(verifierad, AAL2, MFA_VERIFY_PATH)).toBe("ok");
  });

  test("halv inloggning når ingen sida i programmet", () => {
    for (const p of ["/", "/verifikat", "/moms", "/bank", "/installningar", "/kom-igang"]) {
      expect(gate(verifierad, AAL1, p)).toBe("verify-step");
    }
  });

  test("halv inloggning når inte demons ingång heller", () => {
    // /demo räknas som inloggningssida i proxyn när DEMO_MODE=1, alltså en
    // adress en inloggad session annars skickas bort ifrån. Spärren körs före
    // den regeln och ska svara samma sak här som överallt annars — ett undantag
    // för en enskild adress gör spärren till en lista att hålla uppdaterad.
    expect(gate(verifierad, AAL1, "/demo")).toBe("verify-step");
  });

  test("halv inloggning på /login skickas till kodsteget, inte hem", () => {
    // Går den här till "ok" tar login-regeln henne till "/", varifrån spärren
    // tar henne hit igen. Slingan blir osynlig i koden och total i webbläsaren.
    expect(gate(verifierad, AAL1, "/login")).toBe("verify-step");
  });

  test("halv inloggning PÅ kodsteget serveras kodsteget", () => {
    expect(gate(verifierad, AAL1, MFA_VERIFY_PATH)).toBe("on-verify-step");
  });

  test("en avbruten aktivering låser inte ute någon", () => {
    // Overifierad faktor + aal1: kunden har ingen kod till den faktorn, och
    // skulle aldrig kunna ta sig förbi ett kodsteg.
    expect(gate(påbörjad, AAL1, "/")).toBe("ok");
  });
});

describe("kodsteget ligger där proxyn faktiskt kör", () => {
  test("spärren står före regeln som skickar hem inloggade från /login", () => {
    // Ordningen i filen ÄR beteendet. Hamnar spärren efter hemskicket får
    // "on-verify-step" aldrig chansen att svara: /login/verifiera fångas av
    // login-regeln, kunden skickas till "/", spärren tar henne tillbaka hit,
    // och slingan är total i webbläsaren och osynlig i koden. Ett prov på
    // mfaGate ensamt kan inte se det — bara raderna kan.
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    const spärr = proxy.indexOf("mfaGate({");
    const hemskick = proxy.indexOf("user && isLoginPage");
    expect(spärr).toBeGreaterThan(-1);
    expect(hemskick).toBeGreaterThan(-1);
    expect(spärr).toBeLessThan(hemskick);
  });

  test("matchern täcker /login/verifiera", () => {
    // Låg proxyn utanför matchern skulle spärren aldrig köra på kodsteget, och
    // en kund som redan verifierat skulle bli kvar där i stället för att
    // skickas hem. Adressen är vald för att ligga under /login — den delen är
    // en förutsättning, inte en tillfällighet.
    expect(new RegExp(`^${config.matcher[0]}$`).test(MFA_VERIFY_PATH)).toBe(true);
    expect(MFA_VERIFY_PATH.startsWith("/login")).toBe(true);
  });
});

describe("hänvisningen till guiden pekar på något som finns", () => {
  // Community-versionen har inget hjälpcenter i appen. Både kortet och
  // kodsteget skickar därför den som tappat sin telefon till en fil i repot,
  // och det är den enda vägen tillbaka som står skriven någonstans. En
  // hänvisning till en fil som inte finns är värre än ingen hänvisning alls,
  // och den går inte sönder med ett felmeddelande — den blir bara tyst fel
  // dagen någon byter namn på filen.
  const DOC = "docs/TVASTEGSVERIFIERING.md";

  test("filen finns", () => {
    expect(existsSync(join(process.cwd(), DOC))).toBe(true);
  });

  test("den innehåller avsnittet som gränssnittet lovar", () => {
    const doc = readFileSync(join(process.cwd(), DOC), "utf8");
    expect(doc).toContain("Tappat din autentiseringsapp?");
  });

  test.each([
    "src/components/security-settings.tsx",
    "src/app/login/verifiera/page.tsx",
  ])("%s hänvisar dit", (fil) => {
    expect(readFileSync(join(process.cwd(), fil), "utf8")).toContain(DOC);
  });
});

describe("describeMfaError — vad kunden får läsa", () => {
  test("tomt svar när ingenting gick fel", () => {
    expect(describeMfaError(null)).toBe("");
  });

  test("fel kod förklaras med klockan, inte med kunden", () => {
    const text = describeMfaError({ code: "mfa_verification_failed", message: "Invalid TOTP code entered" });
    expect(text).toBe(MFA_WRONG_CODE);
    expect(text).toMatch(/trettionde sekund/);
  });

  test("andra försöket byter förklaring i stället för att upprepa sig", () => {
    const err = { code: "mfa_verification_failed", message: "Invalid TOTP code entered" };
    expect(describeMfaError(err, { attempts: 1 })).toBe(MFA_WRONG_CODE);
    expect(describeMfaError(err, { attempts: 2 })).toBe(MFA_CLOCK_DRIFT);
    expect(describeMfaError(err, { attempts: 5 })).toBe(MFA_CLOCK_DRIFT);
  });

  test.each([
    ["utgången challenge", { code: "mfa_challenge_expired" }, MFA_EXPIRED],
    ["för många försök", { status: 429, message: "Request rate limit reached" }, MFA_RATE_LIMIT],
    ["nätverket", { name: "AuthRetryableFetchError", message: "Failed to fetch" }, MFA_NETWORK],
    ["tappad session", { name: "AuthSessionMissingError", message: "Auth session missing!" }, MFA_SESSION_LOST],
    ["namnkrock", { message: "A factor with the friendly name already exists" }, MFA_NAME_TAKEN],
    ["avstängd i projektet", { code: "mfa_totp_enroll_disabled" }, MFA_DISABLED_IN_PROJECT],
  ])("%s", (_namn, err, väntat) => {
    expect(describeMfaError(err)).toBe(väntat);
  });

  test("nätverksfel går före allt annat och lovar att ingenting ändrats", () => {
    // Ett avbrutet anrop kan bära vilket meddelande som helst. Att skylla på
    // koden då vore fel svar på fel fråga.
    const text = describeMfaError({ name: "AuthRetryableFetchError", message: "Invalid TOTP code entered" });
    expect(text).toBe(MFA_NETWORK);
    expect(text).toMatch(/ingenting har ändrats/);
  });

  test("den engelska råtexten når aldrig kunden", () => {
    for (const err of [
      { message: "Invalid TOTP code entered" },
      { message: "AAL2 required to unenroll a verified factor" },
      { message: "något helt oväntat från servern" },
    ]) {
      expect(describeMfaError(err)).not.toContain(err.message);
    }
  });
});

describe("qrCodeSrc och formatSecret", () => {
  test("en färdig data-URL lämnas orörd", () => {
    const url = "data:image/svg+xml;utf-8,<svg/>";
    expect(qrCodeSrc(url)).toBe(url);
  });

  test("rå SVG görs till något en webbläsare kan visa", () => {
    // Supabase har levererat båda formerna beroende på version, och skillnaden
    // syns inte i typen. Rå SVG rakt i en src ger en tom ruta — alltså en
    // aktivering som inte går att slutföra.
    const src = qrCodeSrc('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    expect(src.startsWith("data:image/svg+xml;utf-8,")).toBe(true);
    expect(src).not.toContain("<svg");
    expect(decodeURIComponent(src.split(",")[1])).toContain("<svg");
  });

  test("tom sträng ger tom src i stället för en trasig data-URL", () => {
    expect(qrCodeSrc("   ")).toBe("");
  });

  test("nyckeln grupperas fyra och fyra för den som skriver av den", () => {
    expect(formatSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(formatSecret("jbswy3dp")).toBe("JBSW Y3DP");
    expect(formatSecret("JBSW Y3DP")).toBe("JBSW Y3DP");
  });
});

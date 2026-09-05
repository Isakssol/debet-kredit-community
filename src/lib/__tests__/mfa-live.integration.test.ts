import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { MFA_VERIFY_PATH, mfaGate, readAal } from "@/lib/mfa/aal";
import { totp, totpWindow } from "./helpers/totp";

/**
 * Tvåstegsverifieringen skarpt: mot en riktig GoTrue, med koder som räknas ut
 * på samma sätt som telefonen räknar ut dem.
 *
 * ---------------------------------------------------------------------------
 * VARFÖR DET HÄR PROVET FINNS VID SIDAN AV mfa-sparr.test.ts
 *
 * Enhetsprovet avgör att VÅRT villkor är rätt: att en verifierad faktor plus
 * aal1 betyder kodsteg, att en avbruten aktivering inte låser ute någon, att
 * kodsteget självt är nåbart. Det kan inte avgöra en enda av de frågor som
 * bara servern kan svara på:
 *
 *  - Ger `verify` verkligen en token med `aal: "aal2"`, eller har vi läst fel
 *    anspråk? Ett fel där ger en spärr som aldrig öppnar.
 *  - Kommer `factors` med i `getUser()`-svaret? Gör den inte det ser varje
 *    konto ut att sakna tvåstegsverifiering, och spärren blir en tom rad.
 *  - Godtar servern en kod räknad ur `totp.secret`? Om nyckeln kommer i något
 *    annat format än vi tror är hela flödet oprövbart.
 *  - Nekas fel kod verkligen?
 *
 * ---------------------------------------------------------------------------
 * HUR DET KÖRS
 *
 * Provet hoppas över utan miljövariabler — precis som byra-live — så en vanlig
 * `vitest run` påverkas inte. Peka det ALDRIG mot en installation någon bokför
 * i: det skapar en användare, slår på tvåstegsverifiering på den och tar bort
 * den efteråt. En lokal stack, eller ett projekt du startat just för prov.
 *
 *   Lokal stack (rekommenderat; kräver [auth.mfa.totp] enroll_enabled = true
 *   i supabase/config.toml, vilket är förvalet i det här repot):
 *
 *     supabase start
 *     MFA_LIVE_URL=http://127.0.0.1:55321 \
 *     MFA_LIVE_ANON_KEY=<anon> MFA_LIVE_SERVICE_KEY=<service_role> \
 *     npx vitest run src/lib/__tests__/mfa-live.integration.test.ts
 *
 * Svarar servern att TOTP är avstängt är det projektets auth-inställningar som
 * saknar Multi-Factor Authentication (TOTP), inte koden här.
 *
 * ---------------------------------------------------------------------------
 * OM TIDEN
 *
 * En TOTP-kod duger i ett fönster på trettio sekunder och får inte återanvändas
 * i samma fönster. Provet verifierar tre gånger, och väntar därför in ett nytt
 * fönster mellan gångerna. Det gör körningen långsam (upp till en dryg minut)
 * och gör den samtidigt ärlig: den prövar samma sak en telefon gör.
 */

const URL_ = process.env.MFA_LIVE_URL;
const ANON = process.env.MFA_LIVE_ANON_KEY;
const SERVICE = process.env.MFA_LIVE_SERVICE_KEY;

const live = Boolean(URL_ && ANON && SERVICE);
const d = live ? describe : describe.skip;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ett anonymt klientpar per inloggning — sessioner ska inte läcka mellan proven. */
const anonClient = () =>
  createClient(URL_!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });

let admin: SupabaseClient;
let userId = "";
let secret = "";
let factorId = "";

const email = `mfa-prov-${randomUUID()}@exempel.test`;
const password = `Prov-${randomUUID()}`;

/** Senaste fönstret vi förbrukat en kod i. Servern nekar samma kod två gånger. */
let förbrukatFönster = -1;

/** Vänta ut ett nytt fönster med marginal kvar, och räkna ut koden. */
async function färskKod(): Promise<string> {
  for (;;) {
    const nu = Math.floor(Date.now() / 1000);
    const fönster = totpWindow(nu);
    const kvar = 30 - (nu % 30);
    // Fem sekunders marginal: koden ska inte hinna bytas mellan uträkningen
    // och serverns kontroll, för då prövar vi nätverkets hastighet i stället
    // för tvåstegsverifieringen.
    if (fönster !== förbrukatFönster && kvar >= 5) {
      förbrukatFönster = fönster;
      return totp(secret, { t: nu });
    }
    await sleep(1000);
  }
}

d("tvåstegsverifiering, skarpt", () => {
  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error) throw new Error(`Kunde inte skapa testanvändaren: ${error.message}`);
    userId = data.user!.id;
  });

  afterAll(async () => {
    // Testanvändaren tas bort oavsett utfall — faktorn följer med kontot.
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("ett konto utan tvåstegsverifiering släpps rakt igenom", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    expect(readAal(data.session!.access_token)).toBe("aal1");

    const { data: userData } = await supabase.auth.getUser();
    expect(mfaGate({
      factors: userData.user!.factors, accessToken: data.session!.access_token, pathname: "/",
    })).toBe("ok");
  });

  test("aktivering: enroll ger en nyckel, och rätt kod lyfter sessionen till aal2", async () => {
    const supabase = anonClient();
    await supabase.auth.signInWithPassword({ email, password });

    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp", friendlyName: "Debet & Kredit",
    });
    expect(enrollError, enrollError?.message).toBeNull();
    expect(enrolled!.totp.secret).toBeTruthy();
    // QR-koden ska vara något vi kan visa — SVG, rå eller som data-URL.
    expect(enrolled!.totp.qr_code).toMatch(/svg/i);

    factorId = enrolled!.id;
    secret = enrolled!.totp.secret;

    // Före bekräftelsen är faktorn overifierad och får inte spärra någonting.
    const { data: halvvägs } = await supabase.auth.getUser();
    expect(mfaGate({
      factors: halvvägs.user!.factors,
      accessToken: (await supabase.auth.getSession()).data.session!.access_token,
      pathname: "/",
    })).toBe("ok");

    const { data: verified, error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId, code: await färskKod(),
    });
    expect(verifyError, verifyError?.message).toBeNull();
    expect(readAal(verified!.access_token)).toBe("aal2");
  }, 90_000);

  test("en ny inloggning stannar på aal1 och når ingen sida i programmet", async () => {
    const supabase = anonClient();
    const { data } = await supabase.auth.signInWithPassword({ email, password });
    expect(readAal(data.session!.access_token)).toBe("aal1");

    // Färska factors från servern — samma anrop proxyn gör.
    const { data: userData } = await supabase.auth.getUser();
    const factors = userData.user!.factors ?? [];
    expect(factors.some((f) => f.status === "verified")).toBe(true);

    const token = data.session!.access_token;
    for (const p of ["/", "/verifikat", "/installningar", "/moms"]) {
      expect(mfaGate({ factors, accessToken: token, pathname: p })).toBe("verify-step");
    }
    // …men kodsteget självt måste vara nåbart, annars går spärren i ring.
    expect(mfaGate({ factors, accessToken: token, pathname: MFA_VERIFY_PATH }))
      .toBe("on-verify-step");
  });

  test("fel kod nekas, och sessionen ligger kvar på aal1", async () => {
    const supabase = anonClient();
    await supabase.auth.signInWithPassword({ email, password });

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: "000000" });
    expect(error).not.toBeNull();

    const { data: efter } = await supabase.auth.getSession();
    expect(readAal(efter.session!.access_token)).toBe("aal1");
  });

  test("rätt kod tar kunden hela vägen in", async () => {
    const supabase = anonClient();
    await supabase.auth.signInWithPassword({ email, password });

    const { data: verified, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId, code: await färskKod(),
    });
    expect(error, error?.message).toBeNull();
    expect(readAal(verified!.access_token)).toBe("aal2");

    const { data: userData } = await supabase.auth.getUser();
    expect(mfaGate({
      factors: userData.user!.factors, accessToken: verified!.access_token, pathname: "/",
    })).toBe("ok");
  }, 90_000);

  test("avstängning tar bort faktorn, och nästa inloggning är åter en enda", async () => {
    const supabase = anonClient();
    await supabase.auth.signInWithPassword({ email, password });

    // Avstängning kräver en session som tagit kodsteget. Det är avsiktligt:
    // annars skulle den som kommit över lösenordet kunna stänga av skyddet.
    const { error: aal1Error } = await supabase.auth.mfa.unenroll({ factorId });
    expect(aal1Error, "unenroll ska kräva aal2").not.toBeNull();

    await supabase.auth.mfa.challengeAndVerify({ factorId, code: await färskKod() });
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    expect(error, error?.message).toBeNull();

    const { data: factors } = await supabase.auth.mfa.listFactors();
    expect((factors?.all ?? []).length).toBe(0);

    const fresh = anonClient();
    const { data } = await fresh.auth.signInWithPassword({ email, password });
    const { data: userData } = await fresh.auth.getUser();
    expect(mfaGate({
      factors: userData.user!.factors, accessToken: data.session!.access_token, pathname: "/",
    })).toBe("ok");
  }, 90_000);
});

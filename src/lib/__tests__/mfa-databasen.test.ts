/**
 * Kodsteget måste gälla under proxyn också.
 *
 * VARFÖR FILEN FINNS. Spärren i `proxy.ts` är prövad från båda håll och den
 * håller: en session som stannat på aal1 når ingen sida och ingen server
 * action. Men appen är inte enda vägen till bokföringen. Anon-nyckeln ligger i
 * varje webbläsare, PostgREST svarar på samma adress, och den som bara har
 * lösenordet får en giltig access-token i samma sekund som lösenordet
 * godkänns. Med den token går det förbi proxyn helt — prövat i licensutgåvan
 * mot en riktig server: 200 på `/rest/v1/verifications`, 201 på en insättning
 * i `customers`.
 *
 * Här är hålet större. Den här utgåvan är byggd för en användare, och varje
 * tabell bär "authenticated full access" med `using (true)`: en aal1-token
 * läser OCH skriver allt. Därför ligger kravet i tre lager, alla i
 * `20260908000004_mfa_second_step_in_rls.sql`:
 *
 *   1. en restriktiv policy per tabell — AND:as med "authenticated full
 *      access" och kan inte hävas av den,
 *   2. samma sak på kvittoarkivet i storage,
 *   3. en statement-trigger, eftersom utgåvans SECURITY DEFINER-funktioner
 *      (book_verification och grannarna) kringgår RLS helt och skriver rakt
 *      in i huvudboken.
 *
 * Utan det tredje lagret hade spärren stoppat PostgREST men inte en RPC.
 *
 * VAD PROVET AVGÖR OCH INTE. Det läser migrationskedjan, inte en databas —
 * samma sort som `search-path.test.ts`. Att en körd databas verkligen svarar
 * så är prövat på två andra ställen: `mfa-live.integration.test.ts` frågar en
 * riktig server om `second_step_pending()`, och migrationen är körd för hand
 * mot en provdatabas där en aal1-session läste noll rader, nekades skrivning
 * med trigger-meddelandet, och släpptes in igen efter kodsteget.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(here, "..", "..", "..", "supabase", "migrations");

function kedjan(): { namn: string; sql: string }[] {
  return fs.readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((namn) => ({ namn, sql: fs.readFileSync(path.join(MIGRATIONS, namn), "utf8") }));
}

const allSql = kedjan().map((f) => f.sql).join("\n");

/** Sista definitionen av en funktion i kedjan — den som gäller i en körd databas. */
function sistaDefinitionen(fn: string): string | null {
  let träff: string | null = null;
  const mönster = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );
  for (const m of allSql.matchAll(mönster)) träff = m[1];
  return träff;
}

describe("second_step_pending — villkoret kodsteget vilar på", () => {
  const def = sistaDefinitionen("second_step_pending");

  test("funktionen finns i kedjan", () => {
    expect(def).not.toBeNull();
  });

  test("räknar bara FÄRDIGKOPPLADE faktorer", () => {
    // En påbörjad aktivering ligger kvar som `unverified`. Räknades den skulle
    // en kund som ångrat sig mitt i aktiveringen bli utelåst ur sin egen
    // bokföring — utan någon kod att ta sig in med.
    expect(def!).toMatch(/status\s*=\s*'verified'/);
    expect(def!).not.toMatch(/status\s*=\s*'unverified'/);
  });

  test("en token utan aal-anspråk räknas som aal1", () => {
    // Fail closed: saknas uppgiften ska svaret bli det försiktiga.
    expect(def!).toMatch(/coalesce\s*\(\s*auth\.jwt\s*\(\s*\)\s*->>\s*'aal'\s*,\s*'aal1'\s*\)/i);
  });

  test("gäller bara inloggade människor, inte maskinkonton", () => {
    expect(def!).toMatch(/auth\.uid\s*\(\s*\)\s+is\s+not\s+null/i);
  });
});

describe("de tre lagren", () => {
  test("policyn är RESTRICTIVE — annars kan 'using (true)' häva den", () => {
    // Det är hela poängen med mönstret: en permissiv policy adderas, en
    // restriktiv AND:as. Tappas ordet `restrictive` blir raden verkningslös
    // utan att något prov eller någon körning klagar.
    const rad = allSql.match(/create policy "kodsteget först" on public\.%I[\s\S]{0,120}/);
    expect(rad, 'policyn "kodsteget först" saknas').not.toBeNull();
    expect(rad![0]).toMatch(/as restrictive/i);
    expect(rad![0]).toMatch(/not second_step_pending\(\)/);
  });

  test("kvittoarkivet är med", () => {
    // storage-policyerna lyder bara `bucket_id = 'underlag'` och släpper in
    // varje inloggning. Underlagen är det känsligaste installationen har.
    const rad = allSql.match(/create policy "kodsteget först underlag" on storage\.objects[\s\S]{0,200}/);
    expect(rad).not.toBeNull();
    expect(rad![0]).toMatch(/as restrictive/i);
    expect(rad![0]).toMatch(/not second_step_pending\(\)/);
  });

  test("triggern finns, för definer-funktionerna kringgår RLS", () => {
    // book_verification och grannarna kör som ägaren; RLS gäller inte inuti
    // dem. En trigger fyrar ändå.
    expect(allSql).toMatch(/create or replace function mfa_block_write\(\)/);
    expect(allSql).toMatch(/trg_mfa_block_write/);
    expect(allSql).toMatch(/for each statement execute function mfa_block_write\(\)/);
  });

  test("triggerns text skyller inte på kunden", () => {
    // Den som ser meddelandet har gjort allting rätt utom ett steg.
    const kropp = sistaDefinitionen("mfa_block_write")!;
    expect(kropp).toMatch(/Inloggningen är inte klar/);
    expect(kropp).not.toMatch(/fel|nekad|obehörig/i);
  });
});

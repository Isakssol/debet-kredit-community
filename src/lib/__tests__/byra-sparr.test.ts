import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Grind för byråspärrarna i SQL.
 *
 * Provet läser migrationerna som text. Det kan inte köra dem — det gör
 * byra-live.integration.test.ts mot en riktig databas. Vad det KAN göra är
 * att hålla fast de fyra besluten som skiljer den här utgåvan från
 * licensutgåvan, och som var för sig ser ut som en detalj i en diff medan de
 * i själva verket är hela skillnaden mellan en läsnyckel och en huvudnyckel.
 *
 * Bakgrunden: i den här utgåvan har varje tabell policyn
 * "authenticated full access" (20260701000001). Det finns ingen rollhierarki
 * att falla tillbaka på. Ett maskinkonto som slinker förbi spärrarna nedan
 * har därmed inte "för mycket åtkomst" — det har allt.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const nycklar = read("supabase/migrations/20260907000012_byra_keys.sql");
const stats = read("supabase/migrations/20260907000013_byra_stats.sql");

describe("spärren gäller maskinkontot, inte den levande nyckeln", () => {
  /**
   * Det farligaste enskilda felet i den här porteringen, och det ser rätt ut:
   * att skriva spärren som `byra_has_access()` i stället för
   * `is_byra_machine()`. Då hade en ÅTERKALLAD nyckel fallit tillbaka på
   * "authenticated full access" och blivit mäktigare än en aktiv — precis
   * tvärtom mot vad återkallningsknappen lovar.
   */
  test("RLS-spärren och skrivvakten frågar om kontot, inte om nyckeln", () => {
    const rls = nycklar.slice(nycklar.indexOf('drop policy if exists "byra aldrig" on public'));
    const spärrblock = rls.slice(0, rls.indexOf("-- ---------- Vakten"));
    expect(spärrblock).toContain("not is_byra_machine()");
    expect(spärrblock).not.toContain("byra_has_access");

    const vakt = nycklar.slice(nycklar.indexOf("create or replace function byra_block_write"));
    expect(vakt).toContain("is_byra_machine()");
    expect(vakt).not.toContain("byra_has_access");
  });

  test("is_byra_machine() bryr sig inte om revoked_at, byra_has_access() gör det", () => {
    const maskin = nycklar.slice(
      nycklar.indexOf("create or replace function is_byra_machine"),
      nycklar.indexOf("create or replace function byra_has_access")
    );
    expect(maskin).not.toContain("revoked_at");

    const access = nycklar.slice(
      nycklar.indexOf("create or replace function byra_has_access"),
      nycklar.indexOf("-- ---------- RLS på nyckeltabellen")
    );
    expect(access).toContain("revoked_at is null");
  });
});

describe("spärren täcker varje tabell, inte en handplockad lista", () => {
  /**
   * En uppräkning hade varit fel svar: den listan hade inte innehållit
   * settings, och settings bär organisationsnummer, bankgiro och kolumnen
   * ai_api_key. Båda spärrarna läggs därför på i en loop över pg_tables.
   */
  test.each([
    ["RLS-spärren", '"byra aldrig"'],
    ["skrivvakten", "trg_byra_block_write"],
  ])("%s läggs på i en loop över pg_tables", (_namn, fragment) => {
    const loopar = nycklar
      .split("do $$")
      .filter((block) => block.includes(fragment));
    expect(loopar).toHaveLength(1);
    expect(loopar[0]).toContain("from pg_tables where schemaname = 'public'");
    expect(loopar[0]).toContain("foreach t in array v_tables");
  });

  test("spärren är restrictive — en permissiv policy ska inte kunna häva den", () => {
    expect(nycklar).toContain("as restrictive for all to authenticated");
  });

  test("kvittoarkivet får en egen spärr, det finns inte i pg_tables", () => {
    expect(nycklar).toContain('create policy "byra aldrig underlag" on storage.objects');
  });
});

describe("skrivvakten är en trigger, för RLS räcker inte", () => {
  /**
   * book_verification, correct_verification och assign_invoice_no är SECURITY
   * DEFINER och utdelade till authenticated (20260901000003). RLS på
   * bastabellerna gäller inte inuti en sådan funktion. En trigger gör det.
   */
  test("triggern fyrar före insert, update och delete", () => {
    expect(nycklar).toMatch(
      /create trigger trg_byra_block_write before insert or update or delete/
    );
  });

  test("triggern är på statement-nivå, inte per rad", () => {
    expect(nycklar).toContain("for each statement execute function byra_block_write()");
    expect(nycklar).not.toContain("for each row execute function byra_block_write()");
  });

  test("vakten släpper igenom service-nyckeln men inte maskinkontot", () => {
    // is_byra_machine() kräver auth.uid() is not null, så pg_cron, SQL-editorn
    // och service-nyckeln passerar utan att vakten behöver räkna upp dem.
    const maskin = nycklar.slice(
      nycklar.indexOf("create or replace function is_byra_machine"),
      nycklar.indexOf("create or replace function byra_has_access")
    );
    expect(maskin).toContain("auth.uid() is not null");
  });
});

describe("aggregatvyns grind", () => {
  test("kräver en inloggad identitet — service-nyckeln får ingen rad", () => {
    const grind = stats.slice(stats.indexOf("where auth.uid() is not null"));
    expect(grind).toContain("auth.uid() is not null");
    expect(grind).toContain("not is_byra_machine() or byra_has_access()");
  });

  test("vyn är security_barrier så anroparens filter inte planeras in under grinden", () => {
    expect(stats).toContain("with (security_barrier = true)");
  });

  test("anon har ingen läsrätt, inte ens till en vy som svarar tomt", () => {
    expect(stats).toContain("revoke all on byra_stats from anon, public");
  });

  test("vyn projicerar räknare och datum — aldrig ett belopp", () => {
    const kropp = stats.slice(stats.indexOf("create or replace view byra_stats"));
    for (const kolumn of ["amount", "debit", "credit", "counterparty", "total"]) {
      expect(kropp.includes(` ${kolumn}`), `vyn nämner ${kolumn}`).toBe(false);
    }
  });
});

describe("nyckelns egenskaper", () => {
  test("scopes kan i den här fasen bara vara stats:read", () => {
    expect(nycklar).toContain("scopes <@ array['stats:read']::text[]");
  });

  test("nyckeln lagras som hash, aldrig i klartext", () => {
    expect(nycklar).toContain("key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$')");
  });

  test("en nyckel kan inte peka på den egna inloggningen", () => {
    // Spärrarna känner igen maskinkontot PÅ nyckelraden. En rad som pekar på
    // den egna inloggningen är därför inte ett konstigt datafel utan en
    // omedelbar utelåsning ur hela installationen.
    expect(nycklar).toContain("create trigger trg_byra_keys_not_self before insert or update on byra_keys");
    expect(nycklar).toContain("new.auth_user_id = auth.uid()");
  });

  test("raderat maskinkonto nollar kopplingen men behåller historiken", () => {
    expect(nycklar).toContain("auth_user_id uuid unique references auth.users(id) on delete set null");
  });

  test("hashen lämnar aldrig servern — sidan hämtar den inte", () => {
    const sida = read("src/app/(app)/installningar/page.tsx");
    const fraga = sida.slice(sida.indexOf('.from("byra_keys")'));
    expect(fraga.slice(0, 400)).not.toContain("key_hash");
  });
});

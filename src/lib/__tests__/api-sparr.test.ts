import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_SCOPES } from "@/lib/api/scopes";

/**
 * Grind för API-nyckelns spärrar i SQL.
 *
 * Provet läser migrationen som text. Det kan inte köra den — det gör
 * beteendeprovet mot en riktig databas. Vad det KAN göra är att hålla fast de
 * beslut som skiljer den här utgåvan från licensutgåvan, och som var för sig
 * ser ut som en detalj i en diff medan de i själva verket är hela skillnaden
 * mellan en scopad nyckel och en huvudnyckel.
 *
 * Bakgrunden är densamma som för byrånycklarna: i den här utgåvan har varje
 * tabell policyn "authenticated full access" (20260701000001 med flera). Det
 * finns ingen rollhierarki att falla tillbaka på. Ett maskinkonto som slinker
 * förbi spärrarna nedan har därmed inte "för mycket åtkomst" — det har allt.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const nycklar = read("supabase/migrations/20260908000002_api_keys.sql");

describe("spärren gäller maskinkontot, inte den levande nyckeln", () => {
  /**
   * Det farligaste enskilda felet i den här porteringen, och det ser rätt ut:
   * att skriva totalspärren som `api_has_scope(...)` i stället för
   * `is_api_machine()`. Då hade en ÅTERKALLAD nyckel fallit tillbaka på
   * "authenticated full access" och blivit mäktigare än en aktiv — precis
   * tvärtom mot vad återkallningsknappen lovar.
   */
  test("totalspärren frågar om kontot, inte om nyckelns scope", () => {
    const block = nycklar.slice(
      nycklar.indexOf("-- 1. Spärra allt."),
      nycklar.indexOf("-- 2. Skrivlistan")
    );
    expect(block).toContain("not is_api_machine()");
    expect(block).not.toContain("api_has_scope");
  });

  test("is_api_machine() bryr sig inte om revoked_at, api_has_scope() gör det", () => {
    const maskin = nycklar.slice(
      nycklar.indexOf("create or replace function is_api_machine"),
      nycklar.indexOf("create or replace function api_has_scope")
    );
    expect(maskin).not.toContain("revoked_at");

    const scope = nycklar.slice(
      nycklar.indexOf("create or replace function api_has_scope"),
      nycklar.indexOf("-- ---------- Kvoten, atomiskt ----------")
    );
    expect(scope).toContain("revoked_at is null");
    expect(scope).toContain("p_scope = any(k.scopes)");
  });
});

describe("spärren täcker varje tabell, inte en handplockad lista", () => {
  /**
   * En uppräkning hade varit fel svar: den listan hade inte innehållit
   * settings, och settings bär organisationsnummer, bankgiro och kolumnen
   * ai_api_key. Båda spärrarna läggs därför på i en loop över pg_tables.
   */
  test.each([
    ["RLS-totalspärren", '"api aldrig"'],
    ["skrivvakten", "trg_api_block_write"],
  ])("%s läggs på i en loop över pg_tables", (_namn, fragment) => {
    const loopar = nycklar
      .split("do $$")
      .filter((block) => block.includes(fragment) && block.includes("pg_tables"));
    expect(loopar).toHaveLength(1);
    expect(loopar[0]).toContain("from pg_tables where schemaname = 'public'");
    expect(loopar[0]).toContain("foreach t in array v_tables");
  });

  test("spärrarna är restrictive — en permissiv policy ska inte kunna häva dem", () => {
    const policyer = [...nycklar.matchAll(/create policy "api [^"]+" on [^\n]*\n?[^\n]*/g)]
      .map((m) => m[0]);
    expect(policyer.length).toBeGreaterThan(3);
    for (const p of policyer) {
      expect(p, `${p.split("\n")[0]} är inte restriktiv`).toContain("as restrictive");
    }
  });

  test("kvittoarkivet får en egen spärr, det finns inte i pg_tables", () => {
    expect(nycklar).toContain('create policy "api aldrig underlag" on storage.objects');
  });

  test("byråns spärrar läggs på de nya tabellerna för hand", () => {
    // Loopen i 20260907000012 läste pg_tables när den kördes och kan inte ha
    // träffat tabeller som inte fanns. Utan det här hade ett byrå-maskinkonto
    // nått api_keys genom "authenticated full access".
    const block = nycklar.slice(
      nycklar.indexOf("-- ---------- Byråns spärrar gäller de nya tabellerna också"),
      nycklar.indexOf("--  Standardläget är nekat")
    );
    for (const t of ["api_keys", "api_rate_counters", "api_idempotency"]) {
      expect(block).toContain(`'${t}'`);
    }
    expect(block).toContain('"byra aldrig"');
    expect(block).toContain("trg_byra_block_write");
  });

  test("migrationen vägrar köra i en databas där någon tabell saknar RLS", () => {
    // En restriktiv policy på en tabell utan row level security skyddar
    // ingenting, och gör det tyst. Grinden står först i filen med flit.
    expect(nycklar).toContain("not c.relrowsecurity");
    expect(nycklar).toMatch(/saknar row level security/);
  });
});

describe("skrivvakten är en trigger, för RLS räcker inte", () => {
  /**
   * book_verification, correct_verification och assign_invoice_no är SECURITY
   * DEFINER och utdelade till authenticated (20260901000003, 20260908000001).
   * RLS på bastabellerna gäller inte inuti en sådan funktion. En trigger gör
   * det. Utan den kunde en ren läsnyckel bokföra i huvudboken — vilket är
   * prövat mot en riktig databas, inte antaget.
   */
  test("triggern fyrar före insert, update och delete", () => {
    expect(nycklar).toMatch(
      /create trigger trg_api_block_write before insert or update or delete/
    );
  });

  test("triggern är på statement-nivå, inte per rad", () => {
    expect(nycklar).toContain("for each statement execute function api_block_write()");
    expect(nycklar).not.toContain("for each row execute function api_block_write()");
  });

  test("vakten kräver ledger:write och släpper igenom service-nyckeln", () => {
    const vakt = nycklar.slice(
      nycklar.indexOf("create or replace function api_block_write"),
      nycklar.indexOf("comment on function api_block_write()")
    );
    // is_api_machine() kräver auth.uid() is not null, så pg_cron, SQL-editorn
    // och service-nyckeln passerar utan att vakten behöver räkna upp dem.
    expect(vakt).toContain("if not is_api_machine() then return null; end if;");
    expect(vakt).toContain("api_has_scope('ledger:write')");
  });

  test("nyckeltabellerna nekas av vakten oavsett scope", () => {
    // En nyckel som kunde skriva sin egen rad kunde höja sitt eget scope, och
    // RLS är inte den enda vägen in: en framtida security definer-funktion
    // skulle ärva öppningen utan att någon tog beslutet.
    const vakt = nycklar.slice(nycklar.indexOf("create or replace function api_block_write"));
    const denylist = vakt.slice(vakt.indexOf("tg_table_name in ("), vakt.indexOf("api_has_scope"));
    for (const t of ["api_keys", "byra_keys", "api_rate_counters", "api_idempotency"]) {
      expect(denylist).toContain(`'${t}'`);
    }
  });
});

describe("läs- och skrivlistan", () => {
  test("skrivlistan är en delmängd av läslistan, och grinden står i filen", () => {
    expect(nycklar).toContain("Skrivlistan innehaller %");
  });

  test("settings står utanför läslistan", () => {
    const oppning = nycklar.slice(nycklar.indexOf("-- 3. Öppna läsningen"));
    const laslista = oppning.slice(oppning.indexOf("v_read constant"), oppning.indexOf("v_insert_oppnas"));
    expect(laslista).not.toContain("'settings'");
    // Raden bär organisationsnummer, bankgiro, IBAN och ai_api_key.
    expect(laslista).not.toContain("'byra_keys'");
    expect(laslista).not.toContain("'api_keys'");
    expect(laslista).not.toContain("'attachments'");
  });

  test("bara kundfakturan öppnas för skrivning, och delete för ingen", () => {
    expect(nycklar).toContain('create policy "api bokfor" on public.invoices');
    expect(nycklar).toContain('create policy "api bokfor rader" on public.invoice_rows');
    expect(nycklar).not.toMatch(/for delete to authenticated\s+using \(not is_api_machine\(\) or/);
  });

  test("varje öppning kräver ett scope, inte bara att vara maskin", () => {
    for (const p of ["api laser", "api bokfor", "api bokfor andring", "api bokfor rader"]) {
      const i = nycklar.indexOf(`"${p}"`);
      expect(i, `${p} saknas`).toBeGreaterThan(-1);
      // Policyerna på läslistan skrivs genom format(), så citattecknen är dubblade
      // där och enkla i de handskrivna. Båda formerna ska godtas.
      expect(nycklar.slice(i, i + 400)).toMatch(/api_has_scope\('{1,2}(data:read|ledger:write)'{1,2}\)/);
    }
  });
});

describe("nyckelns egenskaper", () => {
  test("vokabulären i databasen är den koden känner till", () => {
    // Ett scope som finns i det ena men inte det andra är antingen ett löfte
    // utan täckning eller en väg utan ord.
    const villkor = `scopes <@ array[${API_SCOPES.map((s) => `'${s}'`).join(", ")}]::text[]`;
    expect(nycklar).toContain(villkor);
  });

  test("intake:write finns inte — utgåvan har ingen inkommande väg", () => {
    expect(nycklar).not.toContain("intake:write");
    expect(API_SCOPES).not.toContain("intake:write" as never);
  });

  test("nyckeln lagras som hash, aldrig i klartext", () => {
    expect(nycklar).toContain("key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$')");
  });

  test("prefixets form är densamma i migrationen som i koden", () => {
    expect(nycklar).toContain("key_prefix ~ '^dk_live_[A-Za-z0-9_-]{6}$'");
  });

  test("en nyckel kan inte peka på den egna inloggningen", () => {
    // Spärrarna känner igen maskinkontot PÅ nyckelraden. En rad som pekar på
    // den egna inloggningen är därför inte ett konstigt datafel utan en
    // omedelbar utelåsning ur hela installationen.
    expect(nycklar).toContain("create trigger trg_api_keys_not_self before insert or update on api_keys");
    expect(nycklar).toContain("new.auth_user_id = auth.uid()");
  });

  test("raderat maskinkonto nollar kopplingen men behåller historiken", () => {
    expect(nycklar).toContain("auth_user_id uuid unique references auth.users(id) on delete set null");
  });

  test("hashen lämnar aldrig servern — sidan hämtar den inte", () => {
    const sida = read("src/app/(app)/installningar/page.tsx");
    const fraga = sida.slice(sida.indexOf('.from("api_keys")'));
    expect(fraga.slice(0, 400)).not.toContain("key_hash");
  });
});

describe("städningen ersätter det schemalagda jobb utgåvan inte har", () => {
  test("sparade svar äldre än 72 timmar slängs av skrivningen själv", () => {
    expect(nycklar).toContain("delete from api_idempotency where created_at < now() - interval '72 hours'");
    expect(nycklar).toContain("create trigger trg_api_prune_idempotency after insert on api_idempotency");
  });

  test("räknaren slänger sina egna gamla fönster", () => {
    const kvot = nycklar.slice(nycklar.indexOf("create or replace function api_consume_quota"));
    expect(kvot.slice(0, 1200)).toContain("delete from api_rate_counters");
  });
});

describe("insert på invoices får bara skriva ett utkast", () => {
  /**
   * `invoices` har ingen insert-trigger: `invoices_guard_update()` fyrar bara
   * på UPDATE. Med enbart ett scope-villkor kunde en nyckel med ledger:write
   * lägga in en FÄRDIGBOKFÖRD kundfaktura med självvalt fakturanummer, egna
   * belopp och ett invoice_date i en låst period, utan verifikat — en rad som
   * syns i kundreskontran men aldrig i huvudboken. Prövat skarpt mot en riktig
   * installation: båda förfalskningarna gick igenom före villkoret, ingen
   * efter, och det legitima utkastet skrevs oförändrat i båda lägena.
   */
  const pol = /create policy\s+"api bokfor"\s+on\s+public\.invoices([\s\S]*?);/.exec(nycklar)?.[0] ?? "";

  test("policyn står utskriven med sitt villkor", () => {
    expect(pol, '"api bokfor" på invoices hittades inte').toBeTruthy();
  });

  test.each([
    "status = 'draft'",
    "type = 'debit'",
    "invoice_no is null",
    "ocr is null",
    "verification_id is null",
    "credits_invoice_id is null",
  ])("villkoret %s finns", (villkor) => {
    expect(pol, `${villkor} saknas — raden kan skrivas förbi motorn`).toContain(villkor);
  });

  test("scopet krävs fortfarande", () => {
    expect(pol).toContain("ledger:write");
    expect(pol).toContain("is_api_machine()");
  });
});

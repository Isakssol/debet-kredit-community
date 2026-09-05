-- ============================================================
-- API-nycklar: installationens egen maskinidentitet.
--
-- Bakgrunden. I dag finns exakt en väg in i den här installationen utifrån
-- som inte är en inloggning: STATS_API_KEY, en delad sträng i miljön. En
-- sådan nyckel har ingen identitet, inget scope, ingen lista, ingen
-- återkallningsknapp, och den byts bara av den som kommer åt hostingpanelen
-- och kan göra en redeploy. Det är precis det som gör "slå på ditt API" till
-- ett terminalärende i stället för ett klick.
--
-- byra_keys (20260907000012) är motsatsen och redan byggd. Den här
-- migrationen GENERALISERAR den modellen i stället för att uppfinna en ny.
-- Skillnaderna mot byrån är tre, och alla tre är avsiktliga:
--
--  1. NYCKELN ÄR BEARER-TOKEN DIREKT. Byrån växlar dkb_ mot en kortlivad
--     session därför att byråportalen är en separat produkt med egen
--     sessionshantering. För installationens eget API vore samma dans sämre
--     utvecklarupplevelse utan säkerhetsvinst: integratören skickar
--     Authorization: Bearer dk_live_... på varje anrop och rutten gör
--     växlingen internt. Cachningen i rutten är ofarlig därför att token
--     inte bär någon behörighet — is_api_machine() och api_has_scope() läser
--     api_keys i VARJE fråga.
--
--  2. SCOPES ÄR EN SLUTEN VOKABULÄR. Två ord i den här utgåvan: data:read
--     och ledger:write. Varje nytt värde kräver en migration som samtidigt
--     öppnar den väg värdet ska ge, så att ordet och grinden aldrig glider
--     isär. Samma tvåstegslogik som byrånycklarnas 'stats:read'.
--
--  3. KVOTEN BOR I DATABASEN. En in-memory-räknare i rutten räknar bara sin
--     egen serverless-instans. api_rate_counters räknar per nyckel och timme,
--     atomiskt, oavsett hur många instanser som svarar.
--
-- ============================================================
-- ANPASSNING MOT COMMUNITY-UTGÅVANS ROLLMODELL
-- ============================================================
--
-- Den här utgåvan har ingen rollhierarki: policyn på varje tabell lyder
-- "authenticated full access" (20260701000001 med flera). Det ger tre
-- följder som skiljer filen från licensutgåvans motsvarighet, och alla tre
-- är samma lärdom som byrånycklarna redan fick betala för:
--
--   * DET FINNS INGEN ROLL ATT NEKA I EN UPPRÄKNING. Vokabulären är två
--     predikat i stället: is_api_machine() (är anroparen ett maskinkonto?)
--     och api_has_scope(scope) (har det en levande nyckel med det scopet?).
--
--   * SPÄRREN FRÅGAR OM KONTOT, INTE OM NYCKELN. Hade den frågat om nyckeln
--     levde hade en ÅTERKALLAD nyckel fallit tillbaka på "authenticated full
--     access" och blivit mäktigare än en aktiv — precis tvärtom mot vad
--     återkallningsknappen lovar. Ett maskinkonto rör aldrig en bastabell
--     annat än genom en uttrycklig, scopad öppning längre ned.
--
--   * RLS RÄCKER INTE. Utgåvan har SECURITY DEFINER-funktioner utdelade till
--     authenticated — book_verification, correct_verification och
--     assign_invoice_no (20260901000003, 20260908000001). En sådan funktion
--     kör som sin ägare, och RLS på bastabellerna gäller därför INTE inuti
--     den. Licensutgåvan löser det med assert_write_role() inne i
--     funktionskropparna; en kropp som ligger i två migrationer glider isär.
--     Här används i stället samma grepp som byrån redan etablerat i den här
--     kodbasen: vakten är en TRIGGER på tabellen (api_block_write, längst
--     ned). En trigger fyrar även inuti en security definer-funktion, så
--     vägen är stängd oavsett vem som skriver och oavsett vad framtida
--     RPC:er heter.
--
-- SKRIVVÄGEN ÄR HÅRD REGEL 1, OCH DEN SITTER I DATABASEN. En nyckel med
-- ledger:write kan bokföra, men bara genom exakt de funktioner som bär
-- periodlås, avslutade räkenskapsår, balanskravet och de oföränderliga
-- verifikaten. Bastabellerna för huvudboken är samtidigt stängda för
-- skrivning, så vägen förbi vore en rå tabellskrivning — och den är
-- restriktivt nekad längre ned i filen.
--
-- Nyckelmaterialet lagras aldrig i klartext. Raden bär SHA-256 (hex) och ett
-- prefix för igenkänning. Nyckeln har 256 bitars entropi och visas exakt en
-- gång. Uppslaget sker på hashen i ett unikt index, så jämförelsen läcker
-- ingen tid.
-- ============================================================

-- ---------- Grinden som hela filen vilar på ----------
--
-- En restriktiv policy på en tabell UTAN row level security är verkningslös,
-- och den tystnaden är det farligaste som kan hända i den här filen: allt
-- nedan ser rätt ut i diffen och skyddar ingenting. I licensutgåvan finns
-- en rollhierarki att falla tillbaka på; här finns ingen.
--
-- Blocket skapar därför ingenting — det vägrar bara låta migrationen gå
-- igenom i en databas där någon tabell saknar RLS.
do $$
declare v_utan text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
    into v_utan
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if cardinality(v_utan) > 0 then
    raise exception
      'Tabellerna % saknar row level security. Spärrarna i den här migrationen är restriktiva policyer, och en restriktiv policy på en tabell utan RLS skyddar ingenting.',
      array_to_string(v_utan, ', ');
  end if;
end;
$$;

create table api_keys (
  id uuid primary key default gen_random_uuid(),

  -- Vad integrationen heter för ägaren. Visas i listan under Inställningar.
  name text not null check (length(btrim(name)) between 1 and 120),

  -- SHA-256 (hex) av nyckeln. Nyckeln finns ingen annanstans.
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),

  -- dk_live_ + 6 tecken ur nyckeln. Sex av 43 tecken är 36 av 256 bitar;
  -- 220 bitar återstår, vilket är lika ogissningsbart som 256. Nyttan är
  -- konkret: "nyckeln som börjar dk_live_A7x2Qp" går att peka ut i ett
  -- supportärende utan att nyckeln skickas i ett mejl.
  key_prefix text not null check (key_prefix ~ '^dk_live_[A-Za-z0-9_-]{6}$'),

  -- Vokabulären är sluten. Se resonemanget i filhuvudet. Licensutgåvan har ett
  -- tredje ord för inkommande underlag; den här utgåvan har varken orderintag
  -- eller e-fakturaingång, och ett scope utan en väg bakom sig är ett löfte
  -- utan täckning. Ordet införs den dag vägen införs, i samma migration.
  scopes text[] not null
    check (cardinality(scopes) >= 1
           and scopes <@ array['data:read', 'ledger:write']::text[]),

  -- Maskinkontot rutten loggar in som. Skapas utan lösenord på en adress
  -- under .invalid (RFC 2606) som aldrig kan ta emot post, så "glömt
  -- lösenord" leder ingenstans.
  --
  -- on delete set null, precis som hos byrån: raderas kontot i
  -- Supabase-panelen består historiken och raden slutar öppna något. Båda
  -- följer av samma null.
  auth_user_id uuid unique references auth.users(id) on delete set null,

  -- Per nyckel, inte per installation: en integration som skenar ska inte
  -- kunna tysta de andra.
  rate_limit_per_hour int not null default 600
    check (rate_limit_per_hour between 60 and 20000),

  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  -- Ägarens enda kvitto på VARIFRÅN nyckeln används. En läckt nyckel syns
  -- här innan den syns i bokföringen.
  last_used_ip text check (last_used_ip is null or length(last_used_ip) <= 64),
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users(id) on delete set null,
  note text check (note is null or length(note) <= 500)
);

create index api_keys_active_idx on api_keys (created_at desc) where revoked_at is null;

comment on table api_keys is
  'Scopad maskinidentitet for installationens eget API. Nyckeln lagras som SHA-256; behorigheten harleds ur denna tabell vid varje fraga sa att revoked_at biter omedelbart.';

create table api_rate_counters (
  key_id uuid not null references api_keys(id) on delete cascade,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key_id, window_start)
);

comment on table api_rate_counters is
  'Anrop per API-nyckel och timme. Skrivs enbart av api_consume_quota(); ingen inloggning nar tabellen direkt.';

-- ---------- Upprepade skrivanrop ----------
--
-- Vad det ger och inte ger, utskrivet: det gör integratörens omförsök säkra
-- och gör ett uppspelat, avlyssnat anrop till en verkningslös upprepning.
-- Det skyddar INTE mot en angripare som håller nyckeln och skriver ett eget
-- huvud — mot den vägen är svaret återkallelse, scope och kvot. Det
-- påståendet ska inte tänjas.

create table api_idempotency (
  key_id uuid not null references api_keys(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 255),
  -- SHA-256 av kroppen. Samma huvud med annan kropp är ett annat anrop och
  -- ska få 409, inte det sparade svaret.
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_status int not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (key_id, idempotency_key)
);

create index api_idempotency_created_idx on api_idempotency (created_at);

comment on table api_idempotency is
  'Sparat svar per API-nyckel och Idempotency-Key. Stadas av sig sjalv efter 72 timmar — se api_prune_idempotency().';

alter table api_keys enable row level security;
alter table api_rate_counters enable row level security;
alter table api_idempotency enable row level security;

-- Den inloggade människan råder över sin installation, som överallt annars i
-- utgåvan. Spärrarna längre ned gör att varken ett byrå- eller ett
-- API-maskinkonto når hit.
create policy "authenticated full access" on api_keys
  for all to authenticated using (true) with check (true);

-- api_rate_counters och api_idempotency får MED FLIT ingen tillåtande policy.
-- Raderna skrivs av security definer-funktioner respektive service-nyckeln,
-- och ägaren ser sin förbrukning genom nyckellistan i Inställningar. En
-- tabell utan policy når bara service-nyckeln.
--
-- Att nyckeln inte kan läsa sin egen räknare är avsiktligt: den ska inte
-- kunna se hur nära taket den är och tajma sig runt det.

-- Rättigheterna skrivs ut. Supabase delar ut dem via ALTER DEFAULT
-- PRIVILEGES, men den inställningen finns inte på alla projekt och gäller
-- bara den roll som skapade den. En tabell vars åtkomst beror på hur
-- installationen råkade sättas upp är inte en tabell man låser ett API med.
--
-- anon är utelämnad med flit, och delete likaså: en nyckelrad är historik
-- (vem hade åtkomst, när användes den sist, varifrån). Åtkomst tas bort
-- genom att revoked_at sätts, inte genom att raden försvinner.
revoke all on api_keys, api_rate_counters, api_idempotency from anon, public;
grant select, insert, update on api_keys to authenticated;
grant all on api_keys, api_rate_counters, api_idempotency to service_role;

-- ============================================================
--  Predikaten
-- ============================================================
--
-- Ordningen mellan dem är säkerhetskritisk och värd att läsa två gånger.
-- is_api_machine() frågar om KONTOT är en maskin, inte om nyckeln lever.
-- Det är den som spärrarna nedan använder, och det är med flit: ett
-- maskinkonto vars nyckel dragits in ska inte falla tillbaka på
-- "authenticated full access" och därmed bli mäktigare än när nyckeln levde.
--
-- api_has_scope() lägger till frågan om nyckeln lever OCH bär behörigheten,
-- och används på exakt de ställen där en väg öppnas.
--
-- Båda är security definer därför att rollen inte når api_keys (se spärren
-- nedan) — uppslaget måste ske utanför RLS. Att scopet slås upp på nytt i
-- varje fråga är det som gör återkallelse och scope-ändring omedelbar, och
-- det är också det som gör det ofarligt att cacha sessionen i rutten.

create or replace function is_api_machine() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and exists (select 1 from api_keys k where k.auth_user_id = auth.uid());
$$;
revoke execute on function is_api_machine() from anon, public;
grant execute on function is_api_machine() to authenticated, service_role;

comment on function is_api_machine() is
  'Sant nar den inloggade ar ett API-maskinkonto, aven om nyckeln ar aterkallad. Anvands av sparrarna: ett maskinkonto ror aldrig en bastabell utan en uttrycklig oppning.';

create or replace function api_has_scope(p_scope text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and exists (
       select 1 from api_keys k
        where k.auth_user_id = auth.uid()
          and k.revoked_at is null
          and p_scope = any(k.scopes)
     );
$$;
revoke execute on function api_has_scope(text) from anon, public;
grant execute on function api_has_scope(text) to authenticated, service_role;

comment on function api_has_scope(text) is
  'Sant nar den inloggade ar ett API-maskinkonto med en levande nyckel som bar scopet. Lases vid varje fraga sa att revoked_at och en andrad scope-lista biter omedelbart.';

-- ---------- Kvoten, atomiskt ----------
--
-- En upsert per anrop. Returnerar false när kvoten är slut, och räknar ändå
-- upp: den som fortsätter banka på en tom kvot ska inte kunna nollställa den
-- genom att fortsätta.

create or replace function api_consume_quota(p_key_id uuid, p_limit int) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count int;
begin
  insert into api_rate_counters (key_id, window_start, count)
  values (p_key_id, v_window, 1)
  on conflict (key_id, window_start)
    do update set count = api_rate_counters.count + 1
  returning api_rate_counters.count into v_count;

  -- Utgåvan har inget schemalagt jobb (licensutgåvans cron finns inte här),
  -- så räknaren städar efter sig själv. Fönstret är en timme; allt äldre än
  -- två dygn är historik ingen läser.
  delete from api_rate_counters
   where key_id = p_key_id and window_start < v_window - interval '48 hours';

  return v_count <= p_limit;
end;
$$;
revoke execute on function api_consume_quota(uuid, int) from anon, public, authenticated;
grant execute on function api_consume_quota(uuid, int) to service_role;

-- ---------- Sparade svar städar efter sig ----------
--
-- Licensutgåvan har ett nattligt jobb som rensar api_idempotency. Den här
-- utgåvan har ingen schemaläggare alls, och ett kvarglömt bord är värre än
-- inget bord: kropparna kan innehålla vad som helst ur ett skrivanrop.
-- Städningen hängs därför på skrivningen själv — en statement-trigger, inte
-- en rad-trigger, så kostnaden är ett anrop per sats.

create or replace function api_prune_idempotency() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from api_idempotency where created_at < now() - interval '72 hours';
  return null;
end;
$$;

comment on function api_prune_idempotency() is
  'Statement-trigger som slanger sparade svar aldre an 72 timmar. Ersatter det nattliga jobb den har utgavan inte har.';

create trigger trg_api_prune_idempotency after insert on api_idempotency
  for each statement execute function api_prune_idempotency();

-- ---------- Du kan inte göra dig själv till maskin ----------
--
-- Raden är inte teoretisk. Spärrarna nedan känner igen ett maskinkonto på att
-- det HAR en rad i den här tabellen, så en rad med auth_user_id = din egen
-- inloggning stänger ute dig från hela din egen databas i samma sekund — och
-- eftersom du då inte längre kan läsa api_keys finns det ingen väg tillbaka
-- i gränssnittet. Bara service-nyckeln eller SQL-editorn hade kunnat rädda
-- installationen.
--
-- Samma trigger, samma skäl och samma formulering som byra_keys_not_self().

create or replace function api_keys_not_self() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and new.auth_user_id = auth.uid() then
    raise exception 'En API-nyckel kan inte peka på din egen inloggning. Nyckeln ska ha ett eget maskinkonto — skapa den under Inställningar → API-nycklar.';
  end if;
  return new;
end;
$$;

create trigger trg_api_keys_not_self before insert or update on api_keys
  for each row execute function api_keys_not_self();

-- ---------- Byråns spärrar gäller de nya tabellerna också ----------
--
-- Loopen i 20260907000012 läste pg_tables när den kördes och kan därför inte
-- ha träffat tabeller som inte fanns. Utan de här fyra raderna hade ett
-- byrå-maskinkonto nått api_keys genom "authenticated full access" — alltså
-- läst hashar och scopes för varje integration i installationen.
do $$
declare t text;
begin
  foreach t in array array['api_keys', 'api_rate_counters', 'api_idempotency']
  loop
    execute format('drop policy if exists "byra aldrig" on public.%I', t);
    execute format(
      'create policy "byra aldrig" on public.%I as restrictive for all to authenticated
       using (not is_byra_machine()) with check (not is_byra_machine())', t);
    execute format('drop trigger if exists trg_byra_block_write on public.%I', t);
    execute format(
      'create trigger trg_byra_block_write before insert or update or delete
       on public.%I for each statement execute function byra_block_write()', t);
  end loop;
end;
$$;

-- ============================================================
--  Standardläget är nekat. Öppningen är en uppräkning.
-- ============================================================
--
-- Samma disciplin som "byra aldrig", med skillnaden att listan över öppnade
-- tabeller står som data i den här filen och därmed i diffen.
--
-- TRE SAKER ATT LÄSA TVÅ GÅNGER:
--
--  * `settings` står inte i någon lista och behåller därmed den totala
--    spärren. Raden bär organisationsnummer, bankgiro, IBAN och kolumnen
--    ai_api_key. Behöver ett API företagsuppgifter kommer de ur en projicerad
--    vy, som hos byrån.
--
--  * byra_keys, api_keys, api_rate_counters och api_idempotency öppnas
--    aldrig. api_keys allra minst: en nyckel som kan läsa eller skriva sin
--    egen rad kan höja sitt eget scope. api_has_scope() är security definer
--    just därför att maskinkontot inte når tabellen.
--
--  * Nya tabeller ärver inte spärren. Checklistan när en tabell landar får
--    två rader till: policy för api, eller total spärr, samt vakttriggern.
--    Det statiska provet (src/lib/__tests__/api-sparr.test.ts) grindar att
--    båda läggs på i en loop över pg_tables i stället för en handplockad
--    lista.
--
-- LÄSLISTAN ÄR AVSIKTLIGT SNÄVARE ÄN "ALLT SOM INTE ÄR KÄNSLIGT". Den
-- innehåller exakt de tabeller v1-ytan faktiskt läser, och ingenting mer.
-- bank_transactions, suppliers, supplier_invoices och attachments står med
-- flit utanför: ingen endpoint läser dem i dag, och en tabell som öppnas
-- "för säkerhets skull" är en tabell ingen omprövar. Den dag en endpoint
-- behöver dem flyttas de hit, synligt, i samma migration som endpointen.

-- 1. Spärra allt.
do $$
declare
  t text;
  v_tables text[];
begin
  select coalesce(array_agg(tablename order by tablename), array[]::text[])
    into v_tables
    from pg_tables where schemaname = 'public';

  foreach t in array v_tables
  loop
    execute format('drop policy if exists "api aldrig" on public.%I', t);
    execute format(
      'create policy "api aldrig" on public.%I as restrictive for all to authenticated
       using (not is_api_machine()) with check (not is_api_machine())', t);
  end loop;
end;
$$;

-- 2. Skrivlistan måste vara en delmängd av läslistan.
--
-- Blocket skapar ingen policy och är därför bara en grind: en tabell som går
-- att skriva men inte läsa hade betytt att steg 3 aldrig tog bort dess
-- totalspärr, och skrivpolicyn i steg 4 hade blivit verkningslös utan att
-- något sa ifrån.
do $$
declare
  v_read constant text[] := array[
    'accounts', 'articles', 'customers', 'fiscal_years', 'invoice_payments',
    'invoice_rows', 'invoices', 'period_locks', 'verification_rows',
    'verification_series', 'verifications'
  ];
  v_write constant text[] := array['invoice_rows', 'invoices'];
  t text;
begin
  foreach t in array v_write loop
    if not (t = any(v_read)) then
      raise exception 'Skrivlistan innehaller % som saknas i laslistan. En tabell som skrivs men inte lases behaller totalsparren och skrivpolicyn blir verkningslos.', t;
    end if;
  end loop;
end;
$$;

-- 3. Öppna läsningen — och bara läsningen.
--
-- Totalspärren ersätts av en spärr PER KOMMANDO: select frågar efter
-- data:read, resten nekar rakt av. Att i stället bara TA BORT spärren hade
-- varit fel svar i den här utgåvan — kvar hade legat "authenticated full
-- access", alltså insert, update och delete också. Uppdelningen per kommando
-- är hela skillnaden.
--
-- De kommandon steg 4 ska öppna hoppas över här i stället för att skapas och
-- rivas igen. En policy som finns i en halv fil är en policy någon läser fel.
do $$
declare
  v_read constant text[] := array[
    'accounts', 'articles', 'customers', 'fiscal_years', 'invoice_payments',
    'invoice_rows', 'invoices', 'period_locks', 'verification_rows',
    'verification_series', 'verifications'
  ];
  v_insert_oppnas constant text[] := array['invoice_rows', 'invoices'];
  v_update_oppnas constant text[] := array['invoices'];
  t text;
begin
  foreach t in array v_read
  loop
    execute format('drop policy if exists "api aldrig" on public.%I', t);

    execute format(
      'create policy "api laser" on public.%I as restrictive for select to authenticated
       using (not is_api_machine() or (select api_has_scope(''data:read'')))', t);

    if not (t = any(v_insert_oppnas)) then
      execute format(
        'create policy "api infogar aldrig" on public.%I as restrictive for insert to authenticated
         with check (not is_api_machine())', t);
    end if;

    if not (t = any(v_update_oppnas)) then
      execute format(
        'create policy "api andrar aldrig" on public.%I as restrictive for update to authenticated
         using (not is_api_machine()) with check (not is_api_machine())', t);
    end if;

    -- DELETE öppnas för ingen tabell. Raderad räkenskapsinformation är inte
    -- något ett API ska kunna åstadkomma ens med rätt behörighet.
    execute format(
      'create policy "api raderar aldrig" on public.%I as restrictive for delete to authenticated
       using (not is_api_machine())', t);
  end loop;
end;
$$;

-- 4. Öppna skrivningen — bara kundfakturan, och bara med ledger:write.
--
-- VARFÖR invoices FÅR UPDATE HÄR MEN INTE I LICENSUTGÅVAN. Det är den enda
-- verkliga skillnaden mellan utgåvornas skrivlistor, och den följer av hur
-- bokföringen är byggd, inte av ett annat säkerhetsval:
--
--   licensutgåvan  bokför genom book_invoice(), EN security definer-funktion
--                  som sätter nummer, OCR, kundsnapshot och verifikat i en
--                  transaktion. RLS gäller inte inuti den, så invoices
--                  behöver aldrig vara skrivbar utifrån.
--   den här        bokför i tre steg genom motorns egna vägar:
--                  assign_invoice_no() (definer), book_verification()
--                  (definer) och en UPDATE på invoices. Det tredje steget är
--                  en vanlig skrivning och måste alltså passera RLS.
--
-- Att i stället låta rutten göra det steget med service-nyckeln hade tagit
-- bort RLS från just den skrivning som gör en faktura till räkenskaps-
-- information. Öppningen är smalare och ärligare: raden är fortfarande låst
-- av invoices_guard_update() (20260701000002), som fryser en bokförd fakturas
-- innehåll — samma trigger som gränssnittets egen bokföringsknapp passerar.
--
-- invoice_rows får bara INSERT: rader på en faktura som lämnat utkast är
-- låsta av invoice_rows_guard(), och ett utkast som API:et vill ändra skrivs
-- om genom motorns egen väg.
create policy "api bokfor" on public.invoices
  as restrictive for insert to authenticated
  with check (not is_api_machine() or (select api_has_scope('ledger:write')));

create policy "api bokfor andring" on public.invoices
  as restrictive for update to authenticated
  using (not is_api_machine() or (select api_has_scope('ledger:write')))
  with check (not is_api_machine() or (select api_has_scope('ledger:write')));

create policy "api bokfor rader" on public.invoice_rows
  as restrictive for insert to authenticated
  with check (not is_api_machine() or (select api_has_scope('ledger:write')));

-- ---------- Kvittoarkivet ----------
--
-- Underlagen är det känsligaste som finns i installationen. Storage-policyn
-- (20260701000003) lyder `using (bucket_id = 'underlag')` och släpper därför
-- in varje authenticated inloggning, maskinkonton inkluderade. Ingen
-- v1-endpoint läser eller skriver dem, så spärren är total.
drop policy if exists "api aldrig underlag" on storage.objects;
create policy "api aldrig underlag" on storage.objects
  as restrictive for all to authenticated
  using (not is_api_machine())
  with check (not is_api_machine());

-- ============================================================
--  Vakten som fångar vägarna RLS inte ser
-- ============================================================
--
-- Se filhuvudet: book_verification, correct_verification och
-- assign_invoice_no är SECURITY DEFINER och utdelade till authenticated. RLS
-- på bastabellerna gäller inte inuti dem, så spärrarna ovan hade stoppat ett
-- maskinkonto som skrev via PostgREST men inte ett som anropade
-- book_verification — och den funktionen skriver rakt in i huvudboken.
--
-- Vakten är alltså det som gör ledger:write till en riktig grind i stället
-- för en beskrivning. Den motsvarar assert_write_role() i licensutgåvan, rad
-- för rad, men bor på tabellen i stället för i funktionskroppen.
--
-- Triggern är på STATEMENT-nivå: den svarar på frågan "får den här
-- anroparen skriva i tabellen alls", inte rad för rad. Den fyrar även på en
-- sats som inte träffar någon rad — ett nekat försök ska nekas.
--
-- auth.uid() is null lämnas igenom med flit: service-nyckeln, SQL-editorn och
-- migrationer är betrodda och kan inte vara ett API-maskinkonto. Det är också
-- det som gör att api_consume_quota() och de sparade svaren kan skrivas — de
-- går alltid genom service-nyckeln.

create or replace function api_block_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not is_api_machine() then return null; end if;

  -- Nyckeltabellerna nekas oavsett scope, och oavsett vilken väg skrivningen
  -- tog. En nyckel som kunde skriva sin egen rad kunde höja sitt eget scope,
  -- och RLS är inte den enda vägen in: en framtida security definer-funktion
  -- skulle ärva den öppningen utan att någon tog beslutet.
  if tg_table_name in ('api_keys', 'byra_keys', 'api_rate_counters', 'api_idempotency') then
    raise exception 'En API-nyckel kan inte ändra nycklar. Nycklar hanteras av installationens ägare under Inställningar.';
  end if;

  if api_has_scope('ledger:write') then return null; end if;

  raise exception 'API-nyckeln har inte behörigheten att bokföra. Skapa en nyckel med behörigheten Bokföra under Inställningar → API-nycklar.';
end;
$$;

comment on function api_block_write() is
  'Statement-trigger som nekar skrivning fran ett API-maskinkonto utan ledger:write. Fyrar aven inuti SECURITY DEFINER-funktioner, dar RLS inte galler.';

do $$
declare
  t text;
  v_tables text[];
begin
  select coalesce(array_agg(tablename order by tablename), array[]::text[])
    into v_tables
    from pg_tables where schemaname = 'public';

  foreach t in array v_tables
  loop
    execute format('drop trigger if exists trg_api_block_write on public.%I', t);
    execute format(
      'create trigger trg_api_block_write before insert or update or delete
       on public.%I for each statement execute function api_block_write()', t);
  end loop;
end;
$$;

-- Städtriggern på api_idempotency skriver i sin egen tabell och skulle annars
-- mötas av vakten ovan. Den kör som service-nyckeln (auth.uid() is null) i
-- praktiken, men ordningen mellan triggrarna ska inte behöva vara ett
-- antagande: prune-triggern ligger AFTER och vakten BEFORE, och vakten
-- släpper igenom allt utan inloggning.

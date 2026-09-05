-- ============================================================
-- Byrånycklar: en scopad maskinidentitet för redovisningsbyrån.
--
-- Bakgrunden. I dag finns exakt två sätt att läsa den här installationen
-- utifrån: STATS_API_KEY (en delad bearer-token, utan scope, utan identitet,
-- utan återkallelse per part) och service-nyckeln bakom den, som går förbi
-- ALLA skydd. Ger man en byrå den vägen ger man den också hela huvudboken,
-- kundregistret, underlagen och kolumnen settings.ai_api_key. Det är inte en
-- inställning som råkat bli fel, det är den enda väg som finns.
--
-- Den här migrationen inför en tredje väg, byggd på tre beslut:
--
--  1. NYCKELN ÄR EN RAD I DIN EGEN DATABAS. Byrån kan inte utfärda den åt sig
--     själv, och du ser den under Inställningar → Byråns åtkomst med en
--     återkallningsknapp. En nyckel som bara byrån råder över är inlåsning
--     med extra steg.
--
--  2. BEHÖRIGHETEN HÄRLEDS UR byra_keys VID VARJE FRÅGA. Inte ur en claim i
--     token, inte ur en kopia någon annanstans. Därför biter en återkallelse
--     omedelbart: den som trycker på ÅTERKALLA ska inte behöva vänta ut
--     någons timeout på en redan utfärdad token.
--
--  3. SKRIVVÄGEN ÄR STÄNGD, OCH STÄNGD I DATABASEN. Både genom RLS och genom
--     en vakt som fångar de vägar RLS inte ser (se längst ned). scopes får i
--     den här fasen bara innehålla 'stats:read' — den dag en skrivväg byggs
--     måste samma migration både utöka vokabulären och öppna vakten. Två lås
--     som måste öppnas i samma andetag är svårare att glömma än ett.
--
-- ANPASSNING MOT COMMUNITY-UTGÅVANS ROLLMODELL. Den här utgåvan har ingen
-- rollhierarki: policyn på varje tabell lyder "authenticated full access"
-- (20260701000001). Det gör spärrarna nedan till skillnad från licensutgåvan
-- INTE ett bälte utöver hängslen — de är det enda som står mellan ett
-- maskinkonto och hela databasen. Utan dem hade en byrånyckel varit en
-- fullständig inloggning. Två följder av det:
--
--   * Spärren gäller maskinkontot oavsett om nyckeln är återkallad eller
--     inte. Hade den bara gällt aktiva nycklar hade en ÅTERKALLAD nyckel
--     fallit tillbaka på "authenticated full access" och blivit mäktigare än
--     en aktiv. Ett maskinkonto rör aldrig en bastabell, punkt.
--   * Det finns ingen roll att neka i en uppräkning, så vokabulären är två
--     predikat i stället: is_byra_machine() (är anroparen ett maskinkonto?)
--     och byra_has_access() (har det en levande nyckel?).
--
-- Nyckelmaterialet lagras aldrig i klartext. Raden bär en SHA-256 av nyckeln
-- (hex) och ett prefix på några tecken för igenkänning i listan. Nyckeln
-- själv har 256 bitars entropi och visas exakt en gång, vid utfärdandet.
-- Uppslaget sker på hashen, så jämförelsen är ett indexuppslag och läcker
-- ingen tid.
-- ============================================================

create table byra_keys (
  id uuid primary key default gen_random_uuid(),

  -- Byråns namn som du känner igen den. Visas i listan.
  agency_name text not null check (length(btrim(agency_name)) between 1 and 120),

  -- SHA-256 (hex) av nyckeln. Nyckeln finns ingen annanstans.
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),

  -- Första tecknen ur nyckeln, för att kunna peka ut rätt rad i en supportfråga
  -- ("nyckeln som slutar på ..." fungerar inte när nyckeln bara visats en gång).
  key_prefix text not null check (length(key_prefix) between 4 and 16),

  -- Vad nyckeln får. Läsning av aggregatvyn och ingenting annat i denna fas.
  scopes text[] not null default array['stats:read']::text[]
    check (cardinality(scopes) >= 1 and scopes <@ array['stats:read']::text[]),

  -- Maskinkontot som växlingsrutten loggar in som. Kontot skapas utan lösenord
  -- och kan bara nås genom att någon visar upp nyckeln.
  --
  -- on delete set null, inte cascade: raderas kontot i Supabase-panelen ska
  -- historiken finnas kvar (vem hade åtkomst, när användes den sist), och
  -- raden ska sluta fungera. Båda följer av att auth_user_id blir null —
  -- ingen rad matchar auth.uid() längre.
  auth_user_id uuid unique references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  note text check (note is null or length(note) <= 500)
);

create index byra_keys_active_idx on byra_keys (created_at desc) where revoked_at is null;

comment on table byra_keys is
  'Scopad maskinidentitet for en redovisningsbyra. Nyckeln lagras som SHA-256; behorigheten harleds ur denna tabell vid varje fraga sa att revoked_at biter omedelbart.';

-- ---------- Predikaten ----------
--
-- Ordningen mellan dem är säkerhetskritisk och värd att läsa två gånger.
-- is_byra_machine() frågar om KONTOT är en maskin, inte om nyckeln lever.
-- Det är den som spärrarna nedan använder, och det är med flit: ett
-- maskinkonto vars nyckel dragits in ska inte falla tillbaka på
-- "authenticated full access" och därmed bli mäktigare än när nyckeln levde.
--
-- byra_has_access() lägger till frågan om nyckeln lever, och används på exakt
-- ett ställe: grinden i vyn byra_stats (20260907000013).

create or replace function is_byra_machine() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and exists (select 1 from byra_keys k where k.auth_user_id = auth.uid());
$$;
revoke execute on function is_byra_machine() from anon, public;
grant execute on function is_byra_machine() to authenticated, service_role;

comment on function is_byra_machine() is
  'Sant nar den inloggade ar ett byra-maskinkonto, aven om nyckeln ar aterkallad. Anvands av sparrarna: ett maskinkonto ror aldrig en bastabell.';

create or replace function byra_has_access() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and exists (
       select 1 from byra_keys k
        where k.auth_user_id = auth.uid() and k.revoked_at is null
     );
$$;
revoke execute on function byra_has_access() from anon, public;
grant execute on function byra_has_access() to authenticated, service_role;

comment on function byra_has_access() is
  'Sant nar den inloggade ar ett byra-maskinkonto med en levande nyckel. Lases vid varje fraga sa att revoked_at biter omedelbart.';

-- ---------- RLS på nyckeltabellen ----------
-- Samma modell som resten av utgåvan: den inloggade människan råder över sin
-- installation. Spärren nedan gör att ett maskinkonto varken kan räkna upp
-- andra byråer i installationen eller läsa sin egen nyckelrad.

alter table byra_keys enable row level security;

create policy "authenticated full access" on byra_keys
  for all to authenticated using (true) with check (true);

-- Rättigheterna skrivs ut. Supabase delar ut dem via ALTER DEFAULT PRIVILEGES
-- på schemat public, men den inställningen finns inte på alla projekt och
-- gäller bara den roll som skapade den. En tabell vars åtkomst beror på hur
-- installationen råkade sättas upp är inte en tabell man låser en byrå med.
--
-- anon är utelämnad med flit, och delete likaså: en nyckelrad är historik
-- (vem hade åtkomst, när användes den sist). Åtkomst tas bort genom att
-- revoked_at sätts, inte genom att raden försvinner.
revoke all on byra_keys from anon, public;
grant select, insert, update on byra_keys to authenticated;
grant all on byra_keys to service_role;

-- Du kan inte göra dig själv till byrå.
--
-- Raden är inte teoretisk. Spärrarna nedan känner igen ett maskinkonto på att
-- det HAR en rad i den här tabellen, så en rad med auth_user_id = din egen
-- inloggning stänger ute dig från hela din egen databas i samma sekund — och
-- eftersom du då inte längre kan läsa byra_keys finns det ingen väg tillbaka
-- i gränssnittet. Bara service-nyckeln eller SQL-editorn hade kunnat rädda
-- installationen.
--
-- Maskinkontot ska skapas av issueByraKey(), som gör ett nytt konto åt varje
-- nyckel. Den som skriver raden för hand ska mötas av det här, inte av en
-- utelåsning.
create or replace function byra_keys_not_self() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and new.auth_user_id = auth.uid() then
    raise exception 'En byrånyckel kan inte peka på din egen inloggning. Nyckeln ska ha ett eget maskinkonto — skapa den under Inställningar → Byråns åtkomst.';
  end if;
  return new;
end;
$$;

create trigger trg_byra_keys_not_self before insert or update on byra_keys
  for each row execute function byra_keys_not_self();

-- ---------- Uttryckliga förbud: byra rör aldrig en bastabell ----------
--
-- I licensutgåvan är det här ett extra lager. Här är det bärande: varje
-- tabell har "authenticated full access", så ett maskinkonto utan den här
-- spärren hade läst och skrivit allt.
--
-- Regeln: byra läser aggregatvyn, aldrig en bastabell. Vyn byra_stats
-- (20260907000013) körs som ägare och går förbi RLS, så förbudet hindrar inte
-- den — det hindrar bara vägar förbi den.
--
-- RESTRICTIVE-policyer AND:as med alla andra. En permissiv policy kan alltså
-- inte häva dem. Den dag en bastabell verkligen ska öppnas för byra måste
-- samma migration ta bort en namngiven spärr — synligt, avsiktligt, och
-- granskningsbart i diffen.
--
-- NYA TABELLER ÄRVER INTE SPÄRREN. Checklistan när en tabell landar är
-- densamma som förut, med två rader till: spärren i den här filen, och
-- vakttriggern längst ned.

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
    execute format('drop policy if exists "byra aldrig" on public.%I', t);
    execute format(
      'create policy "byra aldrig" on public.%I as restrictive for all to authenticated
       using (not is_byra_machine()) with check (not is_byra_machine())', t);
  end loop;
end;
$$;

-- Kvittoarkivet. Storage-policyerna i 20260701000003 lyder
-- `using (bucket_id = ''underlag'')` och släpper därför in varje authenticated
-- inloggning, maskinkonton inkluderade. Underlagen är det känsligaste som
-- finns i installationen — spärren skrivs ut även här.
drop policy if exists "byra aldrig underlag" on storage.objects;
create policy "byra aldrig underlag" on storage.objects
  as restrictive for all to authenticated
  using (not is_byra_machine())
  with check (not is_byra_machine());

-- ---------- Vakten som fångar vägarna RLS inte ser ----------
--
-- Det här är den anpassning som INTE finns i licensutgåvan, och den är inte
-- valfri. Utgåvan har tre SECURITY DEFINER-funktioner som är utdelade till
-- authenticated: book_verification, correct_verification och
-- assign_invoice_no (20260901000003). En security definer-funktion kör som
-- sin ägare och RLS på bastabellerna gäller därför INTE inuti den. Spärrarna
-- ovan hade alltså stoppat ett maskinkonto som skrev via PostgREST, men inte
-- ett som anropade book_verification — och den funktionen skriver rakt in i
-- huvudboken.
--
-- Licensutgåvan löser det med assert_write_role() inne i funktionerna. Den
-- vägen kräver att funktionskropparna skrivs om, och en kropp som ligger i
-- två migrationer glider isär. Här används i stället samma grepp som modul 2
-- redan etablerat i den här kodbasen (verification_assert_balance,
-- 20260907000004): vakten är en TRIGGER på tabellen. En trigger fyrar även
-- inuti en security definer-funktion, så vägen är stängd oavsett vem som
-- skriver och oavsett vad framtida RPC:er heter.
--
-- Triggern är på STATEMENT-nivå: den ska svara på frågan "får den här
-- anroparen skriva i tabellen alls", inte kontrollera rad för rad. Det gör
-- den till en funktionsanrop per sats i stället för per rad, och den fyrar
-- även på en sats som inte träffar någon rad — ett nekat försök ska nekas.
--
-- auth.uid() is null lämnas igenom med flit: service-nyckeln, SQL-editorn och
-- pg_cron är betrodda och kan inte vara ett byrå-maskinkonto.

create or replace function byra_block_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if is_byra_machine() then
    raise exception 'Byråns läsnyckel kan inte skriva. Nyckeln ger läsning av aggregatet byra_stats och ingenting annat; skrivvägen öppnas inte förrän den byggs.';
  end if;
  return null;
end;
$$;

comment on function byra_block_write() is
  'Statement-trigger som nekar skrivning fran ett byra-maskinkonto. Fyrar aven inuti SECURITY DEFINER-funktioner, dar RLS inte galler.';

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
    execute format('drop trigger if exists trg_byra_block_write on public.%I', t);
    execute format(
      'create trigger trg_byra_block_write before insert or update or delete
       on public.%I for each statement execute function byra_block_write()', t);
  end loop;
end;
$$;

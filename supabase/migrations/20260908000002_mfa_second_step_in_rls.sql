-- Tvåstegsverifieringen får gälla även när frågan inte går genom appen.
--
-- BAKGRUNDEN. Spärren i proxyn stoppar varje sida, varje RSC-hämtning och
-- varje server action: en session som stannat på aal1 kommer ingenstans i
-- programmet. Men programmet är inte enda vägen till bokföringen. Anon-nyckeln
-- ligger i varje webbläsare, PostgREST svarar på samma adress, och den som
-- bara har lösenordet får en riktig access-token i samma sekund som lösenordet
-- godkänns. Med den token och tre rader curl går det förbi proxyn helt.
--
-- Det är prövat i licensutgåvan, mot en riktig server: en aal1-token svarade
-- 200 på `/rest/v1/verifications` och 201 på en insättning i `customers`.
-- Här är hålet STÖRRE, inte mindre. Den här utgåvan är byggd för en användare
-- och varje tabell bär "authenticated full access" med `using (true)`: en
-- aal1-token läser och SKRIVER allt. Kodsteget skyddade gränssnittet, inte
-- uppgifterna.
--
-- LÖSNINGEN, i den här kodbasens eget mönster. Licensutgåvan har en
-- rollfunktion som varje policy redan frågar, och kravet fick plats där. Här
-- finns ingen sådan funnel — men det finns ett etablerat grepp för exakt det
-- här problemet: restriktiva policyer, som 20260907000012 använder för att
-- hålla byråns maskinkonto borta. En RESTRICTIVE-policy AND:as med alla andra,
-- så en permissiv "using (true)" kan inte häva den. Ingenting behöver skrivas
-- om, ingen befintlig policy rörs, och en villkorad rad läggs bredvid den som
-- redan finns.
--
-- VILLKORET ÄR MED FLIT SMALT. Det slår bara till för konton som SJÄLVA har
-- slagit på tvåstegsverifiering och bekräftat den. Har kontot ingen faktor, en
-- påbörjad men overifierad faktor, eller är anroparen ett maskinkonto
-- (byrånyckel, service-nyckel, pg_cron) händer ingenting alls. Ingen kan bli
-- utelåst av att den här filen körs.
--
-- NYA TABELLER ÄRVER INTE SPÄRREN — samma villkor som gäller "byra aldrig" i
-- grannfilen, och samma checklista: en ny tabell behöver sin rad här.

create or replace function second_step_pending() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (
       select 1 from auth.mfa_factors f
       where f.user_id = auth.uid() and f.status = 'verified'
     )
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2';
$$;
revoke execute on function second_step_pending() from anon, public;
grant execute on function second_step_pending() to authenticated, service_role;

comment on function second_step_pending() is
  'Sant när kontot har en verifierad tvåstegsfaktor men token inte nått aal2. '
  'Bär kodsteget in i RLS, så att kravet gäller även utanför appen.';

-- `coalesce(..., ''aal1'')` gör att en token utan aal-anspråk räknas som aal1:
-- saknas uppgiften ska svaret bli det försiktiga. Och bara `verified` räknas —
-- en påbörjad aktivering som aldrig bekräftades får aldrig stänga någon ute,
-- för till den finns ingen kod.

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
    execute format('drop policy if exists "kodsteget först" on public.%I', t);
    execute format(
      'create policy "kodsteget först" on public.%I as restrictive for all to authenticated
       using (not second_step_pending()) with check (not second_step_pending())', t);
  end loop;
end;
$$;

-- Kvittoarkivet. Storage-policyerna i 20260701000003 lyder
-- `using (bucket_id = ''underlag'')` och släpper in varje authenticated
-- inloggning — alltså också en som har kodsteget kvar. Underlagen är det
-- känsligaste som finns i installationen; spärren skrivs ut även här.
drop policy if exists "kodsteget först underlag" on storage.objects;
create policy "kodsteget först underlag" on storage.objects
  as restrictive for all to authenticated
  using (not second_step_pending())
  with check (not second_step_pending());

-- ---------- Vakten som fångar vägen RLS inte ser ----------
--
-- Samma resonemang som byra_block_write i 20260907000012, och det är inte
-- valfritt här heller. Utgåvan har SECURITY DEFINER-funktioner utdelade till
-- authenticated — book_verification, correct_verification, assign_invoice_no.
-- En definer-funktion kör som sin ägare, och RLS på bastabellerna gäller inte
-- inuti den. Policyerna ovan hade alltså stoppat en halvinloggad session som
-- skrev via PostgREST, men inte en som anropade book_verification — och den
-- skriver rakt in i huvudboken.
--
-- En trigger fyrar även inuti en definer-funktion, så vägen är stängd oavsett
-- vem som skriver och oavsett vad framtida RPC:er heter. Statement-nivå:
-- frågan är "får den här anroparen skriva alls", inte rad för rad.
--
-- auth.uid() is null lämnas igenom med flit — service-nyckeln, SQL-editorn och
-- pg_cron är betrodda och har ingen tvåstegsfaktor att ta.

create or replace function mfa_block_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if second_step_pending() then
    raise exception 'Inloggningen är inte klar. Skriv in koden från din autentiseringsapp, så öppnas bokföringen.';
  end if;
  return null;
end;
$$;

comment on function mfa_block_write() is
  'Statement-trigger som nekar skrivning fran en session som inte tagit kodsteget. '
  'Fyrar aven inuti SECURITY DEFINER-funktioner, dar RLS inte galler.';

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
    execute format('drop trigger if exists trg_mfa_block_write on public.%I', t);
    execute format(
      'create trigger trg_mfa_block_write before insert or update or delete
       on public.%I for each statement execute function mfa_block_write()', t);
  end loop;
end;
$$;

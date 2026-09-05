-- ============================================================
-- byra_stats — det enda byrån får läsa.
--
-- Vyn är avsiktligt EN rad med aggregat och inte en enda affärshändelse.
-- Skälet är inte prestanda utan vad byrån ska kunna svara på när du frågar
-- "vad ser ni egentligen hos mig?". Svaret ska vara läsbart på en rad: hur
-- mycket obokfört, hur många verifikat utan underlag, vad senaste verifikatet
-- är daterat, hur långt perioden är låst, när momsen förfaller och vilket
-- räkenskapsår som är öppet. Inga belopp. Inga motparter. Inga rader.
--
-- Åtkomstkontrollen sitter i vyns egen where-sats, inte i RLS. Vyn körs som
-- ägaren (Postgres standard, security_invoker är inte påslagen) och går
-- därför förbi radnivåsäkerheten på bastabellerna — vilket är exakt vad som
-- behövs: ett byrå-maskinkonto är med flit utestängt från varje bastabell
-- (20260907000012), så en security_invoker-vy hade svarat tomt. Priset är att
-- kontrollen måste stå här, och den är därför skriven som ett villkor på en
-- gate-rad: passerar den inte, projiceras aldrig aggregaten.
--
-- security_barrier = true hindrar att ett filter från anroparen (PostgREST
-- gör ?unbooked_count=gt.0 till en qual) planeras in under vyns egen
-- kontroll.
--
-- Vyn läses också med din egen inloggning. Det är en poäng, inte en bieffekt:
-- misstänker du att byrån ser för mycket ska du kunna öppna exakt samma vy
-- själv och räkna kolumnerna.
-- ============================================================

-- Schemaversion. Utan den kraschar en byråportal på halva klientstocken vid
-- nästa release i stället för att säga "klient X kör en äldre version".
--
-- Antalet körda migrationer är den enda räknare som redan finns och som ökar
-- av sig själv vid varje uppgradering — ingen konstant att komma ihåg att
-- höja, och därmed ingen som glöms. 0 betyder "okänt": installationen fördes
-- upp utan migrationsliggare (rå SQL, återställd dump), och då ska portalen
-- säga att den inte vet i stället för att gissa.
create or replace function byra_schema_version() returns int
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v int;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    return 0;
  end if;
  execute 'select count(*)::int from supabase_migrations.schema_migrations' into v;
  return coalesce(v, 0);
end;
$$;
revoke execute on function byra_schema_version() from anon, public;
grant execute on function byra_schema_version() to authenticated, service_role;

create or replace view byra_stats with (security_barrier = true) as
select
  byra_schema_version()                                as schema_version,
  to_char(current_date, 'YYYYMM')                      as period,

  -- Obokfört = det som väntar på en människa. Banktransaktioner som ännu inte
  -- matchats, plus underlag i inkorgen som ännu inte hängts på ett verifikat.
  --
  -- ANPASSNING. Licensutgåvan räknar här bank + suggestion_queue (AI-förslag)
  -- och drar bort de förslag som redan hör till en banktransaktion för att
  -- inte räkna samma affärshändelse två gånger. Den här utgåvan har ingen
  -- förslagskö; motsvarigheten är underlagsinkorgen, alltså attachments utan
  -- verification_id (samma villkor som /underlag använder). De kan inte
  -- dubbelräknas mot banken — attachments har ingen koppling till
  -- bank_transactions — så avdraget behövs inte här.
  (select count(*)::int from bank_transactions where status = 'unmatched')
    + (select count(*)::int from attachments where verification_id is null)
                                                       as unbooked_count,

  (select count(*)::int from bank_transactions where status = 'unmatched')
                                                       as unmatched_bank,

  -- Samma definition som /api/stats/overview: rättelseverifikat räknas inte,
  -- de ärver originalets underlag. Två endpoints som räknar olika är värre än
  -- en endpoint som saknas.
  (select count(*)::int from verifications v
    where v.source <> 'correction'
      and not exists (select 1 from attachments a where a.verification_id = v.id))
                                                       as attachments_missing,

  (select max(v.verification_date) from verifications v)
                                                       as last_verification,

  -- Sista dagen i den senast låsta månaden.
  --
  -- ANPASSNING. Licensutgåvans period_locks bär ett datum (period_start).
  -- Här bär tabellen (fiscal_year_id, month) där month är ett KALENDERMÅNADS-
  -- nummer inom räkenskapsåret — precis så is_period_locked() läser den
  -- (20260701000001). Kalenderåret för månaden är därför räkenskapsårets
  -- startår när månaden ligger på eller efter startmånaden, annars slutåret.
  -- Uttrycket ger rätt svar även för ett brutet räkenskapsår: 2026-05-01–
  -- 2027-04-30 med månad 3 låst ger 2027-03-31, inte 2026-03-31.
  (select max((make_date(
                 case when pl.month >= extract(month from fy.start_date)::int
                      then extract(year from fy.start_date)::int
                      else extract(year from fy.end_date)::int
                 end,
                 pl.month, 1) + interval '1 month' - interval '1 day')::date)
     from period_locks pl
     join fiscal_years fy on fy.id = pl.fiscal_year_id) as period_locked_to,

  (select min(td.due_date) from tax_deadlines td
    where td.type = 'moms' and td.status = 'pending' and td.due_date >= current_date)
                                                       as vat_due_date,

  fy.start_date                                        as fiscal_year_start,
  fy.end_date                                          as fiscal_year_end,
  fy.status                                            as fiscal_year_status
from (select 1) as gate
left join lateral (
  select f.start_date, f.end_date, f.status
    from fiscal_years f
   where current_date between f.start_date and f.end_date
   order by f.start_date desc
   limit 1
) fy on true
-- Grinden. Utgåvan har ingen rolluppräkning att matcha mot, så villkoret är
-- skrivet som det faktiskt betyder: en inloggad identitet, och om den
-- identiteten är ett byrå-maskinkonto måste dess nyckel leva. En återkallad
-- nyckel ger noll rader i samma sekund revoked_at sätts — inte när den
-- utfärdade token löper ut.
--
-- auth.uid() is null får INGEN rad, till skillnad från licensutgåvan. Det
-- gäller anon (som dessutom saknar select nedan) men också service-nyckeln,
-- och det är avsiktligt: aggregatet ska aldrig gå att hämta med en nyckel som
-- ändå går förbi grinden. Den som har service-nyckeln har bastabellerna.
where auth.uid() is not null
  and (not is_byra_machine() or byra_has_access());

comment on view byra_stats is
  'Aggregat for byraoversikt. En rad, inga affarshandelser. Kontrollen ligger i vyns where-sats eftersom vyn kors som agare och gar forbi RLS pa bastabellerna. Lases av byrans maskinkonto samt av din egen inloggning.';

-- Vyer i public ärver Supabases default-privilegier, som på många projekt
-- omfattar anon. Grinden ovan svarar redan tomt för anon, men en publik
-- läsrätt på något som heter byra_stats är fel signal i en granskning.
revoke all on byra_stats from anon, public;
grant select on byra_stats to authenticated, service_role;

-- ---------- Till den som kör Supabase-lintern ----------
--
-- Två av dess anmärkningar kommer att peka på den här filen, och båda är
-- avsiktliga. Rätta dem inte utan att läsa vad de skyddar:
--
--  * 0010_security_definer_view på byra_stats (nivå ERROR). Vyn SKA köras som
--    ägare. Ett byrå-maskinkonto har med flit ingen läspolicy på någon
--    bastabell (20260907000012), så en security_invoker-vy hade svarat tomt
--    för just den anropare vyn finns till för. Slår man på security_invoker
--    slutar funktionen fungera — tyst, med 403 no_access i portalen.
--
--  * 0029 på byra_schema_version(), och i grannfilen på is_byra_machine() och
--    byra_has_access(). Alla tre är utdelade till authenticated med flit.
--    De två senare svarar bara på frågor om anroparen själv, och den första
--    lämnar ut ett heltal: antalet körda migrationer. Ingen av dem lämnar ut
--    en rad ur någon tabell.
--
-- Det linten INTE anmärker på, men som är den verkliga kontrollen: vyn har
-- ingen läsrätt för anon, och grinden i where-satsen körs före projektionen.

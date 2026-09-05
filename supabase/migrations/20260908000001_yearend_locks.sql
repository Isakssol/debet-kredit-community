-- Årsavslutet gick inte att genomföra.
--
-- Checklistan för årsavslut kräver att alla tolv månader är låsta innan året
-- får avslutas. Bokslutsverifikatet "Årets resultat" dateras på bokslutsdagen
-- — räkenskapsårets sista dag — som alltså med nödvändighet ligger i en låst
-- månad. book_verification nekade det. Villkoren gick inte att uppfylla
-- samtidigt: knappen tändes först när bokföringen var låst, och bokföringen
-- var då låst för just det verifikat knappen skulle skapa.
--
-- Samma sak gäller momsomföringen och ingående balanser. Momsrapporten låser
-- periodens månader och bokför omföringen i samma veva; att den fungerar i dag
-- beror bara på ordningen mellan de två stegen, inte på någon regel. Ingående
-- balanser vid övergång från ett annat program dateras på räkenskapsårets
-- första dag, som kan vara låst.
--
-- Rättelsen: systemets egna bokningar — year_end, vat_report och
-- opening_balance — släpps igenom periodlåset. Inget annat gör det.
-- Källa: bokföringslagen (1999:1078) 5 kap. 2 § (löpande bokföring) och
-- 6 kap. 4 § (räkenskapsåret ska avslutas med ett årsbokslut). Periodlåset är
-- programmets eget skydd mot efterhandsändringar; det får inte hindra de
-- verifikat lagen kräver.
--
-- Ett AVSLUTAT räkenskapsår spärrar fortfarande allt, systembokningar
-- inräknade. Den gränsen flyttas inte.
--
-- Samtidigt flyttas två skydd som hittills bara fanns i appkoden ned i
-- databasen, där de gäller även för den som går direkt på API:et:
--   * en momslåst period kan inte låsas upp,
--   * ett avslutat räkenskapsår kan inte öppnas igen.

create or replace function book_verification(
  p_series_code text,
  p_date date,
  p_description text,
  p_rows jsonb,
  p_counterparty text default null,
  p_source text default 'manual',
  p_corrects uuid default null
) returns table (out_id uuid, out_series text, out_number int)
language plpgsql security definer set search_path = public as $$
declare
  v_fy fiscal_years%rowtype;
  v_series verification_series%rowtype;
  v_number int;
  v_id uuid;
  v_row jsonb;
  v_row_no int := 0;
  v_debit numeric(12,2) := 0;
  v_credit numeric(12,2) := 0;
begin
  select * into v_fy from fiscal_years
   where p_date between start_date and end_date;
  if not found then
    raise exception 'Inget räkenskapsår finns för datumet %.', p_date;
  end if;
  if v_fy.status = 'closed' then
    raise exception 'Räkenskapsåret % är avslutat.', v_fy.year;
  end if;
  -- Bokslut, momsomföring och ingående balanser är systemets egna bokningar och
  -- får göras i en låst period. Året är fortfarande öppet — det är den gränsen
  -- som skyddar den avslutade bokföringen, inte månadslåset.
  if is_period_locked(p_date)
     and coalesce(p_source, 'manual') not in ('year_end', 'vat_report', 'opening_balance') then
    raise exception 'Perioden %-% är låst.', v_fy.year, extract(month from p_date)::int;
  end if;

  if p_rows is null or jsonb_array_length(p_rows) < 2 then
    raise exception 'Ett verifikat måste ha minst två rader.';
  end if;

  -- Summera och validera raderna
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_debit  := v_debit  + coalesce((v_row->>'debit')::numeric(12,2), 0);
    v_credit := v_credit + coalesce((v_row->>'credit')::numeric(12,2), 0);
    if not exists (select 1 from accounts where number = (v_row->>'account')::int and active) then
      raise exception 'Konto % finns inte eller är inaktivt.', v_row->>'account';
    end if;
  end loop;
  if v_debit <> v_credit then
    raise exception 'Verifikatet balanserar inte: debet % ≠ kredit %.', v_debit, v_credit;
  end if;
  if v_debit = 0 then
    raise exception 'Verifikatet saknar belopp.';
  end if;

  -- Lås serien och ta nästa nummer (obruten följd)
  select * into v_series from verification_series
   where fiscal_year_id = v_fy.id and code = p_series_code
   for update;
  if not found then
    raise exception 'Verifikationsserie % finns inte för år %.', p_series_code, v_fy.year;
  end if;
  v_number := v_series.next_number;
  update verification_series set next_number = v_number + 1 where id = v_series.id;

  insert into verifications (fiscal_year_id, series_id, number, verification_date,
                             description, counterparty, source, corrects_id)
  values (v_fy.id, v_series.id, v_number, p_date, p_description, p_counterparty, p_source, p_corrects)
  returning id into v_id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_row_no := v_row_no + 1;
    insert into verification_rows (verification_id, row_no, account, debit, credit, note)
    values (v_id, v_row_no,
            (v_row->>'account')::int,
            coalesce((v_row->>'debit')::numeric(12,2), 0),
            coalesce((v_row->>'credit')::numeric(12,2), 0),
            v_row->>'note');
  end loop;

  -- Länka rättelsekedjan
  if p_corrects is not null then
    update verifications set corrected_by_id = v_id where id = p_corrects and corrected_by_id is null;
  end if;

  return query select v_id, p_series_code, v_number;
end;
$$;

-- En momslåst period är definitiv. Kontrollen fanns i toggleMonthLock; här
-- gäller den också den som går direkt på PostgREST.
create or replace function period_locks_block_unlock() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.reason <> 'manual' then
    raise exception 'Perioden är låst av momsrapporten och kan inte låsas upp.';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_period_locks_block_unlock on period_locks;
create trigger trg_period_locks_block_unlock
  before delete on period_locks
  for each row execute function period_locks_block_unlock();

-- Ett avslutat räkenskapsår kan inte öppnas igen (BFL 6 kap. 4 §).
create or replace function fiscal_years_block_reopen() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'Räkenskapsåret % är avslutat och kan inte öppnas igen.', old.year;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fiscal_years_block_reopen on fiscal_years;
create trigger trg_fiscal_years_block_reopen
  before update on fiscal_years
  for each row execute function fiscal_years_block_reopen();

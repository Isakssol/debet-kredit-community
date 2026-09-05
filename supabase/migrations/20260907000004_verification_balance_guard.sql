-- Balanskravet ska hållas av DATABASEN, inte bara av book_verification.
--
-- Kontrollen debet = kredit fanns enbart inne i book_verification. Varje
-- skrivväg som inte går genom den funktionen — service-nyckeln, SQL-editorn, en
-- framtida import, pg_cron — kunde lägga in ett obalanserat verifikat, eller ett
-- verifikat helt utan rader. Eftersom radering är helt stängd
-- (verifications_restrict_delete) blev ett obalanserat verifikat PERMANENT i
-- huvudboken och gjorde balans- och resultatrapporten fel för all framtid.
--
-- Kontrollen är en CONSTRAINT TRIGGER som är DEFERRABLE INITIALLY DEFERRED:
-- book_verification infogar raderna en och en, så summan går ihop först vid
-- commit. Den ligger på båda tabellerna: raderna fångar obalans och en ensam
-- rad, verifikatet fångar ett verifikat som aldrig fick några rader alls.
--
-- Källa: BFL (1999:1078) 5 kap. 1 § (affärshändelserna ska kunna presenteras i
-- registreringsordning och i systematisk ordning) jämte BFNAR 2013:2 p. 2.3 d–e
-- (kontering och bokfört belopp ska kunna utläsas för varje bokföringspost).
-- Att debet måste vara lika med kredit står inte som egen mening i BFL utan
-- följer av dubbel bokföring och god redovisningssed.

create or replace function verification_assert_balance() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_debit numeric(12,2);
  v_credit numeric(12,2);
  v_rows int;
begin
  if tg_table_name = 'verifications' then
    v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_id := old.verification_id;
  else
    v_id := new.verification_id;
  end if;

  -- Verifikatet kan ha försvunnit i samma transaktion (kaskad från en
  -- demo-återställning) — då finns ingen bokföringspost att kontrollera.
  if not exists (select 1 from verifications v where v.id = v_id) then
    return null;
  end if;

  select coalesce(sum(vr.debit), 0), coalesce(sum(vr.credit), 0), count(*)
    into v_debit, v_credit, v_rows
    from verification_rows vr
   where vr.verification_id = v_id;

  if v_rows < 2 then
    raise exception 'Verifikatet måste ha minst två konteringsrader (dubbel bokföring).';
  end if;
  if v_debit <> v_credit then
    raise exception 'Verifikatet balanserar inte: debet % ≠ kredit %.', v_debit, v_credit;
  end if;
  if v_debit = 0 then
    raise exception 'Verifikatet saknar belopp.';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_verification_rows_assert_balance on verification_rows;
create constraint trigger trg_verification_rows_assert_balance
  after insert or update or delete on verification_rows
  deferrable initially deferred
  for each row execute function verification_assert_balance();

drop trigger if exists trg_verifications_assert_balance on verifications;
create constraint trigger trg_verifications_assert_balance
  after insert on verifications
  deferrable initially deferred
  for each row execute function verification_assert_balance();

-- Kreditering av en betald faktura, och betalning av en krediterad
-- ================================================================
-- Krediteringen vänder originalverifikatets samtliga rader — alltså hela
-- kundfordran — utan att se på registrerade betalningar. En faktura på 12 500 kr
-- med 5 000 kr betalt gav 1510 = 7 500 − 12 500 = −5 000 kr, medan bokslutets
-- avstämning räknade både originalet (status 'credited') och kreditfakturan
-- (type 'credit') som noll. Avstämningen mot 1510 blev 5 000 kr fel och ingen
-- post visade att pengarna ska tillbaka till kunden.
--
-- Vad som ska hända med en redan mottagen betalning går inte att avgöra av
-- programmet: pengarna kan betalas tillbaka, behållas som tillgodohavande eller
-- kvittas mot en ny faktura. Valet är användarens, och tills det är gjort
-- spärras krediteringen med ett fel som säger vad som måste göras först.
--
-- Spegelbilden är lika illa: en inbetalning bokförd på en krediterad eller
-- makulerad faktura lägger en kredit på 1510 utan någon öppen post bakom sig.
--
-- Kontrollerna ligger i DATABASEN och inte bara i serveråtgärden, så att de
-- håller även när en betalning registreras samtidigt som krediteringen skapas.
--
-- Källa: bokföringslagen (1999:1078) 4 kap. 2 § — den sidoordnade bokföringen
-- (kundreskontran) ska kunna stämmas av mot balanskontot; 5 kap. 2 §.
-- Mervärdesskattelagen (2023:200) 17 kap. 22 § — ändringsfakturan ändrar
-- ursprungsfakturans belopp. Skatteverket, rättslig vägledning, "Redovisning av
-- kreditnota".

create or replace function invoices_credit_guard_insert() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_orig invoices%rowtype;
  v_paid numeric(12,2);
begin
  if new.type <> 'credit' or new.credits_invoice_id is null then
    return new;
  end if;

  select * into v_orig from invoices where id = new.credits_invoice_id;
  if not found then
    raise exception 'Originalfakturan finns inte.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from invoice_payments where invoice_id = new.credits_invoice_id;
  if v_paid <> 0 then
    raise exception 'Faktura % har % kr registrerat som betalt. En kreditfaktura vänder hela fakturan, så krediteringen skulle lämna % kr på 1510 utan motsvarighet i kundreskontran. Återbetala eller ta bort betalningen först, och kreditera därefter fakturan.',
      v_orig.invoice_no,
      to_char(v_paid, 'FM999999990D00'),
      to_char(v_paid, 'FM999999990D00');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_credit_guard_insert on invoices;
create trigger trg_invoices_credit_guard_insert
  before insert on invoices
  for each row execute function invoices_credit_guard_insert();

create or replace function invoice_payments_guard_insert() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_status text;
  v_no int;
begin
  select status, invoice_no into v_status, v_no from invoices where id = new.invoice_id;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if v_status = 'draft' then
    raise exception 'Faktura % är inte bokförd och kan inte betalas.', v_no;
  end if;
  if v_status = 'credited' then
    raise exception 'Faktura % är krediterad och är ingen fordran längre. En inbetalning från kunden ska bokföras som en skuld till kunden.', v_no;
  end if;
  if v_status = 'cancelled' then
    raise exception 'Faktura % är makulerad och kan inte betalas.', v_no;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoice_payments_guard_insert on invoice_payments;
create trigger trg_invoice_payments_guard_insert
  before insert on invoice_payments
  for each row execute function invoice_payments_guard_insert();

-- ============================================================
-- Debet & Kredit — kärnschema
-- Grunddata, kontoplan, verifikat med BFL-regler som constraints
-- ============================================================

-- ---------- Grunddata ----------

create table settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Min firma',
  org_number text,                          -- personnummer ÅÅÅÅMMDD-XXXX
  vat_number text,                          -- SE<personnr>01
  address text,
  postal_code text,
  city text,
  email text,
  phone text,
  bankgiro text,
  plusgiro text,
  iban text,
  bic text,
  logo_path text,                           -- Supabase Storage
  default_accounting_method text not null default 'faktureringsmetoden'
    check (default_accounting_method in ('faktureringsmetoden', 'kontantmetoden')),
  vat_period text not null default 'kvartal'
    check (vat_period in ('manad', 'kvartal', 'helar')),
  eu_trade boolean not null default false,  -- styr helårsmomsens deadline + periodisk sammanställning
  default_payment_terms int not null default 30,
  reminder_fee numeric(12,2) not null default 60,
  late_interest_rate numeric(5,2),          -- null = referensränta + 8 %-enheter
  municipal_tax_rate numeric(5,2) not null default 32.00, -- för uttagssimulatorn
  updated_at timestamptz not null default now()
);

create table fiscal_years (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  start_date date not null,
  end_date date not null,
  accounting_method text not null default 'faktureringsmetoden'
    check (accounting_method in ('faktureringsmetoden', 'kontantmetoden')),
  status text not null default 'open' check (status in ('open', 'closed')),
  ib_booked boolean not null default false,
  check (start_date < end_date)
);

-- Momskoder: styr vilken ruta i momsdeklarationen ett kontos belopp hamnar i.
-- boxes = { "underlag": [rutor för beskattningsunderlag], "moms": [rutor för momsbelopp] }
create table vat_codes (
  code text primary key,
  description text not null,
  boxes jsonb not null default '{}'::jsonb
);

create table accounts (
  number int primary key check (number between 1000 and 8999),
  name text not null,
  class int generated always as (number / 1000) stored,
  vat_code text references vat_codes(code),
  default_vat_rate numeric(5,2),            -- förslag vid kontering (t.ex. 25.00 på kostnadskonton)
  sru_code int,                             -- SRU-kod för SIE-export/deklaration (fylls från BAS-kopplingstabell)
  ne_field text,                            -- NE-bilagans ruta: 'R1', 'B7' osv.
  active boolean not null default true,
  blocked boolean not null default false,   -- spärrad för manuell kontering (t.ex. 2650 som bara momsrapporten rör)
  description text
);

-- Datumstyrda momssatser (matmomsen ändras 2026-04-01 — satser får aldrig hårdkodas)
create table vat_rates (
  id uuid primary key default gen_random_uuid(),
  rate_type text not null check (rate_type in ('standard', 'reduced_12', 'reduced_6', 'zero')),
  rate numeric(5,2) not null,
  valid_from date not null,
  valid_to date,
  unique (rate_type, valid_from)
);

-- Regelvärden per år (basbelopp, egenavgifter, milersättning...) — nya år = nya rader
create table rule_values (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value numeric(14,4) not null,
  valid_from date not null,
  valid_to date,
  description text,
  unique (key, valid_from)
);

-- ---------- Verifikat ----------

create table verification_series (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references fiscal_years(id),
  code text not null,
  name text not null,
  next_number int not null default 1,
  manual_entry boolean not null default false, -- får väljas vid manuell registrering
  unique (fiscal_year_id, code)
);

create table verifications (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references fiscal_years(id),
  series_id uuid not null references verification_series(id),
  number int not null,
  verification_date date not null,          -- affärshändelsens datum
  registered_at timestamptz not null default now(), -- när bokföringsposten sammanställdes (BFL 5:7)
  description text not null,
  counterparty text,
  source text not null default 'manual'
    check (source in ('manual', 'quick_event', 'customer_invoice', 'customer_payment',
                      'supplier_invoice', 'supplier_payment', 'vat_report', 'year_end',
                      'correction', 'opening_balance')),
  corrects_id uuid references verifications(id),      -- detta verifikat rättar →
  corrected_by_id uuid references verifications(id),  -- detta verifikat är rättat av →
  unique (series_id, number)
);

create index on verifications (fiscal_year_id, verification_date);

create table verification_rows (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references verifications(id) on delete cascade,
  row_no int not null,
  account int not null references accounts(number),
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  note text,
  check (not (debit > 0 and credit > 0)),
  check (debit > 0 or credit > 0),
  unique (verification_id, row_no)
);

create index on verification_rows (account);

-- Underlag/bilagor — arkiveras 7 år, får inte tas bort så länge verifikatet finns
create table attachments (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid references verifications(id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  uploaded_at timestamptz not null default now()
);

create table period_locks (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references fiscal_years(id),
  month int not null check (month between 1 and 12),
  locked_at timestamptz not null default now(),
  reason text not null default 'manual' check (reason in ('manual', 'vat_report', 'year_end')),
  unique (fiscal_year_id, month)
);

-- ---------- BFL-regler som triggers ----------

-- Hjälpfunktion: är perioden låst för ett datum?
create or replace function is_period_locked(p_date date) returns boolean
language sql stable as $$
  select exists (
    select 1 from period_locks pl
    join fiscal_years fy on fy.id = pl.fiscal_year_id
    where p_date between fy.start_date and fy.end_date
      and pl.month = extract(month from p_date)::int
  ) or exists (
    select 1 from fiscal_years fy
    where p_date between fy.start_date and fy.end_date
      and fy.status = 'closed'
  );
$$;

-- Verifikat är oföränderliga. Enda tillåtna UPDATE: sätta corrected_by_id (en gång).
create or replace function verifications_block_update() returns trigger
language plpgsql as $$
begin
  if new.corrected_by_id is distinct from old.corrected_by_id
     and old.corrected_by_id is null
     and new.id = old.id
     and new.series_id = old.series_id
     and new.number = old.number
     and new.verification_date = old.verification_date
     and new.description = old.description
     and coalesce(new.counterparty,'') = coalesce(old.counterparty,'')
     and new.source = old.source
     and coalesce(new.corrects_id::text,'') = coalesce(old.corrects_id::text,'') then
    return new;
  end if;
  raise exception 'Bokförda verifikat får inte ändras (BFL). Skapa ändringsverifikat i stället.';
end;
$$;

create trigger trg_verifications_block_update
  before update on verifications
  for each row execute function verifications_block_update();

-- Radering: endast det senaste verifikatet i sin serie, och bara i olåst period.
create or replace function verifications_restrict_delete() returns trigger
language plpgsql as $$
declare
  v_max int;
begin
  select max(number) into v_max from verifications where series_id = old.series_id;
  if old.number <> v_max then
    raise exception 'Endast det senaste verifikatet i serien kan raderas. Skapa ändringsverifikat i stället.';
  end if;
  if is_period_locked(old.verification_date) then
    raise exception 'Perioden är låst — verifikatet kan inte raderas.';
  end if;
  -- Återlämna numret så serien förblir obruten
  update verification_series set next_number = old.number where id = old.series_id;
  return old;
end;
$$;

create trigger trg_verifications_restrict_delete
  before delete on verifications
  for each row execute function verifications_restrict_delete();

-- Rader får aldrig röras separat (cascade-delete från verifikatet är ok).
create or replace function verification_rows_block_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from verifications where id = old.verification_id) then
      raise exception 'Verifikatrader får inte raderas separat.';
    end if;
    return old;
  end if;
  raise exception 'Verifikatrader får inte ändras (BFL). Skapa ändringsverifikat i stället.';
end;
$$;

create trigger trg_verification_rows_block_mutation
  before update or delete on verification_rows
  for each row execute function verification_rows_block_mutation();

-- Bilagor får inte raderas så länge verifikatet finns (7 års arkivering)
create or replace function attachments_restrict_delete() returns trigger
language plpgsql as $$
begin
  if old.verification_id is not null
     and exists (select 1 from verifications where id = old.verification_id) then
    raise exception 'Underlag kopplat till verifikat får inte raderas (arkiveringskrav 7 år).';
  end if;
  return old;
end;
$$;

create trigger trg_attachments_restrict_delete
  before delete on attachments
  for each row execute function attachments_restrict_delete();

-- ---------- Bokföringsfunktionen (enda vägen in) ----------
-- Atomisk: validerar balans, period, serie; tilldelar obrutet nummer.
-- rows: [{"account": 1930, "debit": 0, "credit": 1250.00, "note": "..."}, ...]
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
  if is_period_locked(p_date) then
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

-- Ändringsverifikat: vänder originalet + bokför korrekt version. Båda länkas till originalet.
create or replace function correct_verification(
  p_original uuid,
  p_new_date date,
  p_new_description text,
  p_new_rows jsonb,
  p_reason text
) returns table (reversal_id uuid, replacement_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_orig verifications%rowtype;
  v_series_code text;
  v_reversed jsonb;
  v_rev_id uuid;
  v_new_id uuid;
begin
  select * into v_orig from verifications where id = p_original;
  if not found then
    raise exception 'Originalverifikatet finns inte.';
  end if;
  if v_orig.corrected_by_id is not null then
    raise exception 'Verifikatet är redan rättat.';
  end if;
  select code into v_series_code from verification_series where id = v_orig.series_id;

  -- Vändning: spegla debet/kredit
  select jsonb_agg(jsonb_build_object(
           'account', account, 'debit', credit, 'credit', debit,
           'note', 'Vändning'))
    into v_reversed
    from verification_rows where verification_id = p_original;

  select out_id into v_rev_id from book_verification(
    v_series_code, p_new_date,
    format('Rättelse av %s%s: %s', v_series_code, v_orig.number, p_reason),
    v_reversed, v_orig.counterparty, 'correction', p_original);

  if p_new_rows is not null then
    select out_id into v_new_id from book_verification(
      v_series_code, p_new_date, p_new_description, p_new_rows,
      v_orig.counterparty, 'correction', p_original);
  end if;

  return query select v_rev_id, v_new_id;
end;
$$;

-- ---------- Uppdaterad-tidsstämpel ----------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_settings_touch before update on settings
  for each row execute function touch_updated_at();

-- ---------- RLS (en användare: authenticated = full åtkomst) ----------
do $$
declare t text;
begin
  foreach t in array array['settings','fiscal_years','vat_codes','accounts','vat_rates',
    'rule_values','verification_series','verifications','verification_rows',
    'attachments','period_locks']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

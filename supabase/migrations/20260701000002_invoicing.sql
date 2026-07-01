-- ============================================================
-- Trimtech Bokföring — fakturering & leverantörer
-- ============================================================

-- ---------- Kunder & artiklar ----------

create sequence customer_no_seq start 1001;

create table customers (
  id uuid primary key default gen_random_uuid(),
  customer_no int not null unique default nextval('customer_no_seq'),
  name text not null,
  org_number text,
  vat_number text,                          -- krävs vid EU omvänd skattskyldighet
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  country text not null default 'SE',
  delivery_address text,
  payment_terms int,                        -- null = default från settings
  vat_type text not null default 'SE'
    check (vat_type in ('SE', 'EU_REVERSE', 'EXPORT')),
  language text not null default 'sv' check (language in ('sv', 'en')),
  currency text not null default 'SEK',
  our_reference text,
  your_reference text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  article_no text not null unique,
  name text not null,
  unit text not null default 'st',          -- st, tim, mån, mil...
  price numeric(12,2) not null default 0,   -- exkl. moms
  vat_rate numeric(5,2) not null default 25.00,
  type text not null default 'service' check (type in ('service', 'goods')),
  sales_account int not null references accounts(number),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Kundfakturor ----------
-- Fakturanummer: obruten löpande serie (momslagens krav). Tilldelas när
-- fakturan bokförs/skickas — utkast har inget nummer.

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no int unique,                    -- sätts vid bokföring, aldrig återanvänds
  ocr text,                                 -- genereras från invoice_no (Luhn + längdsiffra)
  type text not null default 'debit' check (type in ('debit', 'credit')),
  status text not null default 'draft'
    check (status in ('draft', 'booked', 'sent', 'partially_paid', 'paid', 'credited', 'cancelled')),
  customer_id uuid not null references customers(id),
  customer_snapshot jsonb,                  -- namn/adress/vatnr fryses vid bokföring (fakturan är juridisk handling)
  invoice_date date not null default current_date,
  due_date date not null,
  payment_terms int not null default 30,
  our_reference text,
  your_reference text,
  currency text not null default 'SEK',
  language text not null default 'sv',
  vat_type text not null default 'SE' check (vat_type in ('SE', 'EU_REVERSE', 'EXPORT')),
  credits_invoice_id uuid references invoices(id), -- kreditfaktura → original
  verification_id uuid references verifications(id), -- faktureringsmetoden: bokförs vid utfärdande
  net_amount numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  rounding numeric(12,2) not null default 0, -- öresavrundning → 3740
  total_amount numeric(12,2) not null default 0,
  sent_at timestamptz,
  pdf_path text,                            -- arkiverad faktura-PDF i Storage
  notes text,                               -- syns på fakturan
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on invoices (status);
create index on invoices (customer_id);

create table invoice_rows (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  row_no int not null,
  article_id uuid references articles(id),
  description text not null default '',     -- tom + belopp 0 = textrad
  quantity numeric(12,2) not null default 1,
  unit text not null default 'st',
  unit_price numeric(12,2) not null default 0,
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  vat_rate numeric(5,2) not null default 25.00,
  account int references accounts(number),
  is_text_row boolean not null default false,
  unique (invoice_id, row_no)
);

create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  payment_date date not null,
  amount numeric(12,2) not null,            -- negativt vid återbetalning/kreditkvittning
  verification_id uuid references verifications(id),
  note text,
  created_at timestamptz not null default now()
);

create table invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  reminder_no int not null,
  sent_date date not null default current_date,
  fee numeric(12,2) not null default 0,
  unique (invoice_id, reminder_no)
);

-- Återkommande fakturor (v1.5 — tabellen förberedd)
create table recurring_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  template jsonb not null,                  -- rader + villkor
  interval_months int not null default 1,
  next_date date not null,
  end_date date,
  active boolean not null default true
);

-- Fakturanummer: atomisk tilldelning via sekvens-tabell (obruten serie över alla år)
create table invoice_counter (
  id int primary key default 1 check (id = 1),
  next_no int not null default 1
);
insert into invoice_counter (next_no) values (1);

create or replace function assign_invoice_no() returns int
language plpgsql security definer set search_path = public as $$
declare v_no int;
begin
  update invoice_counter set next_no = next_no + 1 where id = 1
  returning next_no - 1 into v_no;
  return v_no;
end;
$$;

-- Bokförd faktura är låst: endast status-/betalfält får ändras
create or replace function invoices_guard_update() returns trigger
language plpgsql as $$
begin
  if old.status = 'draft' then
    new.updated_at = now();
    return new;
  end if;
  -- Bokförd/skickad: fakturainnehållet är fryst
  if new.invoice_no is distinct from old.invoice_no
     or new.type is distinct from old.type
     or new.customer_id is distinct from old.customer_id
     or new.invoice_date is distinct from old.invoice_date
     or new.net_amount is distinct from old.net_amount
     or new.vat_amount is distinct from old.vat_amount
     or new.total_amount is distinct from old.total_amount
     or new.credits_invoice_id is distinct from old.credits_invoice_id then
    raise exception 'Bokförd faktura får inte ändras — skapa kreditfaktura.';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_invoices_guard_update
  before update on invoices
  for each row execute function invoices_guard_update();

-- Fakturarader låses när fakturan lämnat utkast
create or replace function invoice_rows_guard() returns trigger
language plpgsql as $$
declare v_status text;
begin
  select status into v_status from invoices
   where id = coalesce(new.invoice_id, old.invoice_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Rader på bokförd faktura får inte ändras.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_invoice_rows_guard
  before insert or update or delete on invoice_rows
  for each row execute function invoice_rows_guard();

-- Endast utkast får raderas (bokförda fakturor är räkenskapsinformation)
create or replace function invoices_restrict_delete() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' then
    raise exception 'Bokförd faktura får inte raderas — makulera med kreditfaktura.';
  end if;
  return old;
end;
$$;

create trigger trg_invoices_restrict_delete
  before delete on invoices
  for each row execute function invoices_restrict_delete();

-- ---------- Leverantörer ----------

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_number text,
  bankgiro text,
  plusgiro text,
  payment_terms int not null default 30,
  default_expense_account int references accounts(number),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  invoice_no text,                          -- leverantörens fakturanummer
  ocr text,
  invoice_date date not null,
  due_date date not null,
  total_amount numeric(12,2) not null,      -- inkl. moms
  vat_amount numeric(12,2) not null default 0,
  status text not null default 'unpaid'
    check (status in ('unpaid', 'partially_paid', 'paid', 'credited')),
  verification_id uuid references verifications(id), -- faktureringsmetoden: bokförd vid registrering
  attachment_path text,
  notes text,
  created_at timestamptz not null default now()
);

create index on supplier_invoices (status);

create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references supplier_invoices(id),
  payment_date date not null,
  amount numeric(12,2) not null,
  verification_id uuid references verifications(id),
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['customers','articles','invoices','invoice_rows',
    'invoice_payments','invoice_reminders','recurring_invoices','invoice_counter',
    'suppliers','supplier_invoices','supplier_payments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

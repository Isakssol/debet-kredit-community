-- CRM: offerter (→ order → faktura) + säljpipeline med uppföljning
create sequence quote_no_seq start 1;
create sequence order_no_seq start 1;

create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no int not null unique default nextval('quote_no_seq'),
  order_no int unique,                       -- sätts när offerten accepteras (blir order)
  customer_id uuid not null references customers(id),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced')),
  quote_date date not null default current_date,
  valid_until date not null,
  your_reference text,
  notes text,
  net_amount numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  converted_invoice_id uuid references invoices(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quote_rows (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  row_no int not null,
  article_id uuid references articles(id),
  description text not null default '',
  quantity numeric(12,2) not null default 1,
  unit text not null default 'st',
  unit_price numeric(12,2) not null default 0,
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  vat_rate numeric(5,2) not null default 25.00,
  account int references accounts(number),
  is_text_row boolean not null default false
);

-- Säljpipeline: affärsmöjligheter med steg, värde och nästa åtgärd
create table deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  customer_id uuid references customers(id) on delete set null,
  contact text,                              -- namn/telefon när kunden inte är upplagd ännu
  value numeric(12,2),                       -- uppskattat värde exkl. moms
  stage text not null default 'lead'
    check (stage in ('lead', 'contacted', 'quoted', 'won', 'lost')),
  quote_id uuid references quotes(id) on delete set null,
  next_action text,                          -- "Ring och följ upp"
  next_action_at date,                       -- dyker upp i Att göra
  notes text,
  position int not null default 0,           -- sortering inom kolumnen
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotes enable row level security;
alter table quote_rows enable row level security;
alter table deals enable row level security;
create policy "authenticated full access" on quotes
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on quote_rows
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on deals
  for all to authenticated using (true) with check (true);

create index on quotes (status);
create index on deals (stage, position);
create index on deals (next_action_at) where next_action_at is not null;

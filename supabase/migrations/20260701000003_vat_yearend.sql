-- ============================================================
-- Debet & Kredit — moms, skattekalender, anläggningar, bokslut
-- ============================================================

-- ---------- Momsrapporter ----------

create table vat_reports (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references fiscal_years(id),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  boxes jsonb not null default '{}'::jsonb, -- { "05": 100000, "10": 25000, ..., "49": 22000 }
  verification_id uuid references verifications(id), -- omföringsverifikatet till 2650
  eskd_xml text,                             -- genererad eSKD-fil
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (fiscal_year_id, period_start)
);

-- Godkänd momsrapport får inte ändras/raderas
create or replace function vat_reports_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'Godkänd momsrapport får inte raderas.';
    end if;
    return old;
  end if;
  if old.status = 'approved' then
    raise exception 'Godkänd momsrapport får inte ändras.';
  end if;
  return new;
end;
$$;

create trigger trg_vat_reports_guard
  before update or delete on vat_reports
  for each row execute function vat_reports_guard();

-- ---------- Skattekalender ----------

create table tax_deadlines (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('moms', 'f_skatt', 'inkomstdeklaration',
                                     'periodisk_sammanstallning', 'other')),
  title text not null,
  due_date date not null,
  period_start date,
  period_end date,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  auto_generated boolean not null default true,
  unique (type, due_date)
);

-- ---------- Anläggningsregister ----------

create table assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purchase_date date not null,
  purchase_value numeric(12,2) not null,     -- exkl. moms
  account int not null references accounts(number),          -- t.ex. 1220/1250
  contra_account int not null references accounts(number),   -- ack. avskr: 1229/1259
  depreciation_account int not null references accounts(number), -- 7832/7835
  useful_life_years int not null default 5,
  acc_depreciation numeric(12,2) not null default 0,
  status text not null default 'active'
    check (status in ('active', 'fully_depreciated', 'sold', 'scrapped')),
  disposal_date date,
  disposal_amount numeric(12,2),
  verification_id uuid references verifications(id), -- inköpsverifikatet
  notes text,
  created_at timestamptz not null default now()
);

create table asset_depreciations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  fiscal_year_id uuid not null references fiscal_years(id),
  amount numeric(12,2) not null,
  method text not null check (method in ('rule_30', 'rule_20', 'manual')),
  verification_id uuid references verifications(id),
  unique (asset_id, fiscal_year_id)
);

-- ---------- Årsavslut ----------

create table year_end_closings (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null unique references fiscal_years(id),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  checklist jsonb not null default '{}'::jsonb,
  k1_data jsonb,                             -- förenklat årsbokslut (B1–B16, R1–R12, U1–U4)
  ne_data jsonb,                             -- NE-bilagans fält inkl. justeringar R13–R48
  result_verification_id uuid references verifications(id), -- 8999 → 2019
  equity_verification_id uuid references verifications(id), -- nollställning eget kapital → 2010
  completed_at timestamptz
);

-- Periodiseringsfonder (deklarationspost — bokförs EJ vid K1, men måste spåras 6 år)
create table tax_allocation_reserves (
  id uuid primary key default gen_random_uuid(),
  tax_year int not null unique,              -- avsättningsåret
  amount numeric(12,2) not null,
  reversed_amount numeric(12,2) not null default 0,
  check (reversed_amount <= amount)
);

-- Sparad räntefördelning & expansionsfond (deklarationsposter över åren)
create table tax_carryforwards (
  id uuid primary key default gen_random_uuid(),
  key text not null,                         -- 'sparad_rantefordelning', 'expansionsfond'
  tax_year int not null,
  amount numeric(12,2) not null,
  unique (key, tax_year)
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['vat_reports','tax_deadlines','assets','asset_depreciations',
    'year_end_closings','tax_allocation_reserves','tax_carryforwards']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

-- ---------- Storage: bucket för underlag ----------
insert into storage.buckets (id, name, public)
values ('underlag', 'underlag', false)
on conflict (id) do nothing;

create policy "authenticated read underlag" on storage.objects
  for select to authenticated using (bucket_id = 'underlag');
create policy "authenticated upload underlag" on storage.objects
  for insert to authenticated with check (bucket_id = 'underlag');

-- ============================================================
-- Bankkoppling: kontokopplingar (PSD2-aggregator) + importerade
-- banktransaktioner med matchningsstatus
-- ============================================================

create table bank_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gocardless' check (provider in ('gocardless', 'csv')),
  institution_id text,               -- t.ex. 'SWEDBANK_SWEDSESS'
  institution_name text,             -- 'Swedbank'
  requisition_id text,               -- aggregatorns koppling-id
  account_id text,                   -- aggregatorns konto-id
  account_iban text,
  ledger_account int not null default 1930 references accounts(number),
  status text not null default 'pending'
    check (status in ('pending', 'linked', 'expired', 'error')),
  consent_expires_at timestamptz,    -- PSD2-samtycke (typiskt 90/180 dagar)
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references bank_connections(id),
  external_id text,                  -- bankens/aggregatorns transaktions-id (dedup)
  booking_date date not null,
  amount numeric(12,2) not null,     -- positivt = insättning, negativt = uttag
  currency text not null default 'SEK',
  description text not null,        -- transaktionstext från banken
  counterpart text,                  -- motpart om banken anger
  balance_after numeric(12,2),       -- saldo efter transaktionen (från CSV)
  status text not null default 'unmatched'
    check (status in ('unmatched', 'booked', 'matched', 'ignored')),
  verification_id uuid references verifications(id), -- bokförd/avprickad mot
  imported_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create index on bank_transactions (status);
create index on bank_transactions (booking_date);

-- Dedup för CSV-import utan externt id: hash på datum+belopp+text
create unique index bank_transactions_dedup
  on bank_transactions (booking_date, amount, description)
  where external_id is null;

do $$
declare t text;
begin
  foreach t in array array['bank_connections', 'bank_transactions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

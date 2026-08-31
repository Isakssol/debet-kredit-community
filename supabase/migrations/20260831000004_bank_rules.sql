-- Bokföringsregler för banktransaktioner: "självgående bokföring".
-- En regel matchar på text i transaktionens beskrivning/motpart och anger
-- motkonto + momssats. auto_book=true → bokförs automatiskt vid entydig träff.
create table bank_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  match_text text not null,                 -- delsträng, skiftlägesokänslig
  direction text not null default 'both'
    check (direction in ('in', 'out', 'both')),
  account int not null references accounts(number),   -- kostnads-/intäktskonto
  vat_rate numeric(5,2) not null default 0
    check (vat_rate in (0, 6, 12, 25)),
  liquidity_account int not null default 1930 references accounts(number),
  auto_book boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table bank_rules enable row level security;
create policy "authenticated full access" on bank_rules
  for all to authenticated using (true) with check (true);

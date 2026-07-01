-- Egna konteringsmallar (Fortnox-mönstret: spara vanliga konteringar, återanvänd med nytt belopp)
create table posting_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  -- rader med andelar: [{"account": 6212, "side": "debit", "share": 0.8}, ...]
  -- share = andel av totalbeloppet (summan av debet-andelar = summan av kredit-andelar = 1)
  rows jsonb not null,
  created_at timestamptz not null default now()
);

alter table posting_templates enable row level security;
create policy "authenticated full access" on posting_templates
  for all to authenticated using (true) with check (true);

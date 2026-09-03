-- ============================================================
-- Kompletteringar: leverantörsfakturans kontering, körjournal,
-- referensränta, underlagsinkorg-stöd
-- ============================================================

-- Leverantörsfaktura: kostnadskonto + momssats för konteringen
alter table supplier_invoices
  add column expense_account int references accounts(number),
  add column vat_rate numeric(5,2) not null default 25.00;

-- Körjournal (underlag för skattefri milersättning)
create table trips (
  id uuid primary key default gen_random_uuid(),
  trip_date date not null,
  from_location text not null,
  to_location text not null,
  purpose text not null,
  km numeric(8,1) not null check (km > 0),
  verification_id uuid references verifications(id), -- satt när milersättningen bokförts
  created_at timestamptz not null default now()
);

alter table trips enable row level security;
drop policy if exists "authenticated full access" on storage.objects;
create policy "authenticated full access" on trips
  for all to authenticated using (true) with check (true);

-- Riksbankens referensränta (för dröjsmålsränta: referensränta + 8 %-enheter)
insert into rule_values (key, value, valid_from, valid_to, description) values
  ('referensranta', 2.00, '2026-01-01', '2026-12-31',
   'Riksbankens referensränta — kontrollera aktuellt värde på riksbank.se');

-- Underlagsinkorg: filer får raderas ur Storage när de inte är kopplade till verifikat
drop policy if exists "authenticated delete underlag" on storage.objects;
create policy "authenticated delete underlag" on storage.objects
  for delete to authenticated using (bucket_id = 'underlag');

create index on attachments (verification_id) where verification_id is null;

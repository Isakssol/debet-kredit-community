-- ============================================================
--  DEMOMILJÖ för Debet & Kredit
--  Körs EN gång i demo-projektets SQL Editor (EFTER alla
--  vanliga migrationer via `supabase db push`).
--  Skapar: intresseanmälningar, seed- och resetfunktioner,
--  samt nattlig återställning via pg_cron.
-- ============================================================

-- Intresseanmälningar från demo-entrén (namn + företag = leads)
create table if not exists demo_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  created_at timestamptz not null default now()
);
alter table demo_signups enable row level security;
drop policy if exists "authenticated insert" on demo_signups;
create policy "authenticated insert" on demo_signups
  for insert to authenticated with check (true);
-- (ingen select-policy: besökare kan inte läsa varandras anmälningar;
--  du läser dem via service-nyckeln/panelen)

-- ------------------------------------------------------------
--  Seed: Demofirman Bygg & Montage — realistisk exempeldata
-- ------------------------------------------------------------
create or replace function demo_seed() returns void
language plpgsql security definer as $$
begin
  -- Företaget
  update settings set
    company_name = 'Demofirman Bygg & Montage',
    org_number = '19850101-2385',
    address = 'Exempelgatan 1', postal_code = '722 12', city = 'Västerås',
    email = 'hej@demofirman.se', phone = '021-000 00 00', bankgiro = '123-4567',
    vat_period = 'kvartal', company_type = 'enskild_firma',
    onboarded_at = now(), checklist_hidden = false,
    dismissed_checklist_steps = null, ai_rules = null, dashboard_widgets = null,
    theme_accent = null, theme_background = null
  where id = 1;

  -- Kunder
  insert into customers (name, org_number, email, phone, address, postal_code, city)
  values
    ('Byggpartner i Mälardalen AB', '556123-4567', 'inkop@byggpartner.se', '021-123456', 'Industrigatan 8', '721 30', 'Västerås'),
    ('BRF Solsidan', '769600-1234', 'styrelsen@brfsolsidan.se', null, 'Solvägen 2', '722 20', 'Västerås'),
    ('Villaägare Andersson', null, 'familjen@andersson.se', '070-1234567', 'Björkallén 14', '725 90', 'Västerås');

  -- Artiklar
  insert into articles (article_no, name, unit, price, vat_rate, type, sales_account) values
    ('TIM', 'Snickeriarbete, timpris', 'tim', 640, 25, 'service', 3011),
    ('MONT', 'Montering kök, fast pris', 'st', 18500, 25, 'service', 3011),
    ('ALT', 'Altanbygge per kvm', 'st', 1850, 25, 'service', 3011),
    ('RESA', 'Servicebil, framkörning', 'st', 450, 25, 'service', 3011);

  -- Verifikat (via book_verification så alla regler gäller)
  perform book_verification('A', '2026-06-02', 'Egen insättning vid start', '[{"account":1930,"debit":25000,"credit":0},{"account":2018,"debit":0,"credit":25000}]'::jsonb, 'Demofirman', 'quick_event', null);
  perform book_verification('A', '2026-06-05', 'Verktygsinköp, faktura 1042', '[{"account":5410,"debit":7960,"credit":0},{"account":2640,"debit":1990,"credit":0},{"account":1930,"debit":0,"credit":9950}]'::jsonb, 'Bygghandeln AB', 'quick_event', null);
  perform book_verification('A', '2026-06-12', 'Kökssmontage BRF Solsidan, faktura 1001', '[{"account":1930,"debit":23125,"credit":0},{"account":3011,"debit":0,"credit":18500},{"account":2611,"debit":0,"credit":4625}]'::jsonb, 'BRF Solsidan', 'quick_event', null);
  perform book_verification('A', '2026-06-18', 'Drivmedel servicebil, kvitto 8814', '[{"account":5611,"debit":760,"credit":0},{"account":2640,"debit":190,"credit":0},{"account":1930,"debit":0,"credit":950}]'::jsonb, 'Circle K', 'quick_event', null);
  perform book_verification('A', '2026-06-30', 'Mobilabonnemang juni', '[{"account":6212,"debit":359.2,"credit":0},{"account":2640,"debit":89.8,"credit":0},{"account":1930,"debit":0,"credit":449}]'::jsonb, 'Telia', 'quick_event', null);
  perform book_verification('A', '2026-07-04', 'Altanbygge Andersson 24 kvm, faktura 1002', '[{"account":1930,"debit":55500,"credit":0},{"account":3011,"debit":0,"credit":44400},{"account":2611,"debit":0,"credit":11100}]'::jsonb, 'Villaägare Andersson', 'quick_event', null);
  perform book_verification('A', '2026-07-08', 'Virke och beslag altanprojekt, faktura 7741', '[{"account":4010,"debit":18400,"credit":0},{"account":2640,"debit":4600,"credit":0},{"account":1930,"debit":0,"credit":23000}]'::jsonb, 'Bygghandeln AB', 'quick_event', null);
  perform book_verification('A', '2026-07-15', 'Företagsförsäkring årspremie', '[{"account":6310,"debit":5400,"credit":0},{"account":1930,"debit":0,"credit":5400}]'::jsonb, 'Länsförsäkringar', 'quick_event', null);
  perform book_verification('A', '2026-07-22', 'Timarbete Byggpartner v.28-29, faktura 1003', '[{"account":1930,"debit":51200,"credit":0},{"account":3011,"debit":0,"credit":40960},{"account":2611,"debit":0,"credit":10240}]'::jsonb, 'Byggpartner i Mälardalen AB', 'quick_event', null);
  perform book_verification('A', '2026-07-25', 'Eget uttag', '[{"account":2013,"debit":20000,"credit":0},{"account":1930,"debit":0,"credit":20000}]'::jsonb, 'Demofirman', 'quick_event', null);
  perform book_verification('A', '2026-07-31', 'Mobilabonnemang juli', '[{"account":6212,"debit":359.2,"credit":0},{"account":2640,"debit":89.8,"credit":0},{"account":1930,"debit":0,"credit":449}]'::jsonb, 'Telia', 'quick_event', null);
  perform book_verification('A', '2026-08-06', 'Arbetskläder och skyddsutrustning, kvitto 3312', '[{"account":5480,"debit":1832,"credit":0},{"account":2640,"debit":458,"credit":0},{"account":1930,"debit":0,"credit":2290}]'::jsonb, 'Blåkläder Store', 'quick_event', null);
  perform book_verification('A', '2026-08-12', 'Timarbete Byggpartner v.32, faktura 1004', '[{"account":1930,"debit":25600,"credit":0},{"account":3011,"debit":0,"credit":20480},{"account":2611,"debit":0,"credit":5120}]'::jsonb, 'Byggpartner i Mälardalen AB', 'quick_event', null);
  perform book_verification('A', '2026-08-19', 'Drivmedel servicebil, kvitto 9107', '[{"account":5611,"debit":824,"credit":0},{"account":2640,"debit":206,"credit":0},{"account":1930,"debit":0,"credit":1030}]'::jsonb, 'OKQ8', 'quick_event', null);
  perform book_verification('A', '2026-08-27', 'Reparation golvbrunn BRF Solsidan, faktura 1005', '[{"account":1930,"debit":11400,"credit":0},{"account":3011,"debit":0,"credit":9120},{"account":2611,"debit":0,"credit":2280}]'::jsonb, 'BRF Solsidan', 'quick_event', null);
  perform book_verification('A', '2026-08-29', 'Bankavgifter augusti', '[{"account":6570,"debit":120,"credit":0},{"account":1930,"debit":0,"credit":120}]'::jsonb, 'Banken', 'quick_event', null);

  -- Banktransaktioner: två som väntar på hantering
  insert into bank_transactions (booking_date, amount, description, counterpart, status) values
    ('2026-08-28', -449.00, 'AUTOGIRO TELIA', 'Telia Sverige AB', 'unmatched'),
    ('2026-08-30', 40875.00, 'SWISH INBET CARPORT', null, 'unmatched');

  -- En bokföringsregel som visar regelmotorn
  insert into bank_rules (name, match_text, direction, account, vat_rate, liquidity_account) values
    ('Telia mobilabonnemang', 'telia', 'out', 6212, 25, 1930);
end $$;

-- ------------------------------------------------------------
--  Nattlig återställning: rensa allt och kör om seeden
-- ------------------------------------------------------------
create or replace function demo_reset() returns void
language plpgsql security definer as $$
begin
  -- Stäng av oföränderlighets-triggrarna under städning
  set session_replication_role = replica;
  truncate advisor_messages, advisor_conversations, suggestion_queue,
    payroll_runs, bank_transactions, bank_rules, deals, quote_rows, quotes,
    invoice_reminders, invoice_payments, invoice_rows, invoices,
    recurring_invoices, supplier_payments, supplier_invoices, suppliers,
    attachments, verification_rows, verifications,
    trips, asset_depreciations, assets, articles, customers,
    period_locks, vat_reports, year_end_closings, tax_allocation_reserves cascade;
  set session_replication_role = default;
  -- Nollställ nummerserier
  perform setval('customer_no_seq', 1000, true);
  alter sequence quote_no_seq restart with 1;
  alter sequence order_no_seq restart with 1;
  update verification_series set next_number = 1;
  perform demo_seed();
end $$;

-- Kör första seeden nu
select demo_reset();

-- Schemalägg nattlig reset 03:00 (kräver pg_cron: Database → Extensions → pg_cron)
create extension if not exists pg_cron;
select cron.schedule('demo-nightly-reset', '0 3 * * *', 'select demo_reset()');

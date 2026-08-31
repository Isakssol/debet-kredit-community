-- Enkel lön för enmans-AB: en lönekörning per period, bokförd + AGI-underlag
create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^20[0-9]{2}(0[1-9]|1[0-2])$'),  -- ÅÅÅÅMM
  employee_name text not null,
  employee_personal_number text not null,   -- 12 siffror
  gross_salary numeric(12,2) not null check (gross_salary > 0),
  tax_deduction numeric(12,2) not null check (tax_deduction >= 0),
  employer_fee numeric(12,2) not null,      -- arbetsgivaravgift, beräknad vid körning
  workplace_address text,
  workplace_city text,
  verification_id uuid references verifications(id),
  created_at timestamptz not null default now(),
  unique (period, employee_personal_number)
);

alter table payroll_runs enable row level security;
create policy "authenticated full access" on payroll_runs
  for all to authenticated using (true) with check (true);

-- Arbetsgivaravgift som regelvärde (full avgift 2026)
insert into rule_values (key, value, valid_from, description)
values ('arbetsgivaravgift_pct', 31.42, '2026-01-01', 'Lagstadgade arbetsgivaravgifter, full avgift (%)')
on conflict do nothing;

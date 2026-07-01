-- Saldovyer för rapporter och dashboard

create view account_balances with (security_invoker = true) as
select v.fiscal_year_id,
       r.account,
       a.name as account_name,
       a.class,
       sum(r.debit)  as total_debit,
       sum(r.credit) as total_credit,
       sum(r.debit - r.credit) as balance
from verification_rows r
join verifications v on v.id = r.verification_id
join accounts a on a.number = r.account
group by v.fiscal_year_id, r.account, a.name, a.class;

create view ledger_entries with (security_invoker = true) as
select r.id,
       v.fiscal_year_id,
       v.verification_date,
       s.code || v.number as verification_label,
       v.id as verification_id,
       v.description,
       r.account,
       a.name as account_name,
       r.debit,
       r.credit,
       r.note
from verification_rows r
join verifications v on v.id = r.verification_id
join verification_series s on s.id = v.series_id
join accounts a on a.number = r.account;

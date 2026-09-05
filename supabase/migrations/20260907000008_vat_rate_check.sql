-- ============================================================
-- Giltiga svenska momssatser på fakturarader, artiklar och
-- leverantörsfakturor.
--
-- Endast 25, 12, 6 och 0 procent finns i 9 kap. mervärdesskattelagen
-- (2023:200). Skatteverkets momsdeklaration har fält för just dessa satser:
-- 10 (25 %), 11 (12 %) och 12 (6 %) — se "Fylla i momsdeklarationen".
--
-- Utan spärren kan en rad med t.ex. 8 % nå databasen via API:t eller en
-- manipulerad formulärpost. Momsen räknas då fram, debiteras kunden och visas
-- på fakturan, men konteringen har inget momskonto för satsen — momsen bokförs
-- aldrig, verifikatet blir obalanserat och beloppet redovisas aldrig till
-- Skatteverket.
-- ============================================================

alter table invoice_rows drop constraint if exists invoice_rows_vat_rate_valid;
alter table invoice_rows
  add constraint invoice_rows_vat_rate_valid
  check (vat_rate in (0, 6, 12, 25));

alter table articles drop constraint if exists articles_vat_rate_valid;
alter table articles
  add constraint articles_vat_rate_valid
  check (vat_rate in (0, 6, 12, 25));

alter table supplier_invoices drop constraint if exists supplier_invoices_vat_rate_valid;
alter table supplier_invoices
  add constraint supplier_invoices_vat_rate_valid
  check (vat_rate in (0, 6, 12, 25));

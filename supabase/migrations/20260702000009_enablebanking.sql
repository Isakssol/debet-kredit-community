-- Byte av PSD2-leverantör: GoCardless (stängt för nya kunder 2025) → Enable Banking
alter table bank_connections drop constraint bank_connections_provider_check;
alter table bank_connections add constraint bank_connections_provider_check
  check (provider in ('enablebanking', 'gocardless', 'csv'));
alter table bank_connections alter column provider set default 'enablebanking';

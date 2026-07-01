-- Röktest av bokföringsmotorns lagregler. Körs mot lokal DB.
\set ON_ERROR_STOP off

\echo '--- Test 1: obalanserat verifikat ska AVVISAS ---'
select book_verification('A', '2026-07-01', 'TEST obalans',
  '[{"account":1930,"debit":100},{"account":6110,"credit":50}]'::jsonb);

\echo '--- Test 2: balanserat verifikat ska BOKFÖRAS (A1) ---'
select out_series, out_number from book_verification('A', '2026-06-15', 'Kontorsmaterial Clas Ohlson',
  '[{"account":6110,"debit":400},{"account":2640,"debit":100},{"account":1930,"credit":500}]'::jsonb,
  'Clas Ohlson', 'quick_event');

\echo '--- Test 3: eget uttag ska BOKFÖRAS (A2) ---'
select out_series, out_number from book_verification('A', '2026-06-20', 'Eget uttag',
  '[{"account":2013,"debit":15000},{"account":1930,"credit":15000}]'::jsonb);

\echo '--- Test 4: UPDATE på bokfört verifikat ska AVVISAS ---'
update verifications set description = 'hackad' where source = 'quick_event';

\echo '--- Test 5: DELETE av rad ska AVVISAS ---'
delete from verification_rows where account = 6110;

\echo '--- Test 6: DELETE av A1 (inte sist i serien) ska AVVISAS ---'
delete from verifications where number = 1
  and series_id = (select id from verification_series where code = 'A' limit 1);

\echo '--- Test 7: rättelse via correct_verification ska ge vändning A3 + nytt A4 ---'
select * from correct_verification(
  (select v.id from verifications v join verification_series s on s.id = v.series_id
    where s.code = 'A' and v.number = 1),
  '2026-06-30', 'Kontorsmaterial Clas Ohlson (rättad)',
  '[{"account":5460,"debit":400},{"account":2640,"debit":100},{"account":1930,"credit":500}]'::jsonb,
  'fel konto: 6110 skulle vara 5460');

\echo '--- Test 8: rättelsekedjan är korslänkad ---'
select s.code || v.number as ver, v.source,
       (select s2.code || v2.number from verifications v2
         join verification_series s2 on s2.id = v2.series_id
         where v2.id = v.corrects_id) as rattar,
       (select s3.code || v3.number from verifications v3
         join verification_series s3 on s3.id = v3.series_id
         where v3.id = v.corrected_by_id) as rattad_av
from verifications v join verification_series s on s.id = v.series_id
order by v.number;

\echo '--- Test 9: verifikat i låst period ska AVVISAS ---'
insert into period_locks (fiscal_year_id, month)
  select id, 5 from fiscal_years where year = 2026;
select book_verification('A', '2026-05-10', 'TEST låst period',
  '[{"account":6110,"debit":100},{"account":1930,"credit":100}]'::jsonb);
delete from period_locks;

\echo '--- Test 10: huvudbokssaldon (1930 ska vara -15500) ---'
select account, sum(debit) - sum(credit) as saldo
from verification_rows group by account order by account;

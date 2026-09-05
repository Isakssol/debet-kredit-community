-- Skärpning efter säkerhetsgenomgång: bokförda verifikat kunde raderas om de
-- var senast i serien ("ångra senaste"-regeln från v1). Funktionen var oanvänd
-- av appen och motsäger både BFL:s anda och löftet att verifikat aldrig kan
-- raderas. Nu blockeras all radering — rättelse sker uteslutande via
-- ändringsverifikat (correct_verification).
--
-- Källa: BFL (1999:1078) 5 kap. 5 § — rättelse av en bokföringspost ska ske så
-- att det framgår vad som rättats, av vem och när; den ursprungliga uppgiften
-- får inte göras oläslig. BFNAR 2013:2 p. 5.15 säger detsamma om verifikationer.
-- En demo-återställnings TRUNCATE påverkas inte (den körs med
-- session_replication_role = replica, som stänger av triggrarna).

create or replace function verifications_restrict_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Bokförda verifikat får inte raderas (BFL). Skapa ändringsverifikat i stället.';
end $$;
alter function verifications_restrict_delete() set search_path = public, pg_temp;

-- Arkiveringsskyddet för underlag gick att kringgå i två steg.
--
-- attachments_restrict_delete vägrar radera en bilaga vars verification_id
-- pekar på ett existerande verifikat — men det fanns ingen UPDATE-vakt, och
-- attachments ligger under den öppna skrivpolicyn för inloggad användare. Den
-- som har appens klientnyckel kunde därför först `PATCH` raden till
-- verification_id = null och sedan radera den; storage-policyn för okopplat
-- underlag släppte i sin tur filen eftersom den villkoras på exakt samma
-- verification_id. Verifikatets underlag försvann medan verifikatet stod kvar.
--
-- Nu: kopplingen till ett verifikat är enkelriktad. Ett okopplat underlag kan
-- kopplas (det är så inkorgen fungerar), men ett kopplat kan varken kopplas loss
-- eller flyttas till ett annat verifikat, och lagringsnyckeln kan inte skrivas
-- om under fötterna på arkivexporten.
--
-- Källa: BFL (1999:1078) 7 kap. 2 § (räkenskapsinformation ska bevaras till och
-- med sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades)
-- och 7 kap. 6 § (den får inte förstöras innan bevarandetiden gått ut).
-- https://lagen.nu/1999:1078#K7P2

create or replace function attachments_guard_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.verification_id is not null
     and new.verification_id is distinct from old.verification_id
     and exists (select 1 from verifications v where v.id = old.verification_id) then
    raise exception 'Underlag som är kopplat till ett verifikat kan inte kopplas loss eller flyttas (arkiveringskrav sju år, BFL 7 kap. 2 §).';
  end if;
  if new.storage_path is distinct from old.storage_path then
    raise exception 'Underlagets lagringsplats kan inte ändras. Ladda upp filen på nytt i stället.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attachments_guard_update on attachments;
create trigger trg_attachments_guard_update
  before update on attachments
  for each row execute function attachments_guard_update();

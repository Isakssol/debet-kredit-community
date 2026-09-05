-- Tak för påminnelseavgiften
-- =========================
-- createReminder kontrollerade ingenting alls om avgiften, så en avgift på
-- 500 kr gick igenom trots att lagen sätter taket till 60 kr. Taket läggs som
-- ett regelvärde i stället för att hårdkodas, så att det går att se på
-- regelsidan och ändra den dag beloppet ändras i lagen.
--
-- Källa: lag (1981:739) om ersättning för inkassokostnader m.m. 4 § andra
-- stycket — ersättningsskyldigheten omfattar 60 kronor för betalningspåminnelse
-- (180 kronor för krav och 170 kronor för upprättande av amorteringsplan).
-- Enligt 2 § utgår ersättning för skriftlig betalningspåminnelse bara om avtal
-- om detta har träffats senast i samband med skuldens uppkomst, och enligt 4 §
-- första stycket bara för kostnader som varit skäligen påkallade.
-- https://lagen.nu/1981:739
insert into rule_values (key, value, valid_from, valid_to, description) values
  ('paminnelseavgift_max', 60.00, '2026-01-01', null,
   'Högsta ersättning för skriftlig betalningspåminnelse, lag (1981:739) 4 §')
on conflict (key, valid_from) do nothing;

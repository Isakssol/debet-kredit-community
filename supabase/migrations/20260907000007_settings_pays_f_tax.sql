-- Betalar företaget debiterad preliminärskatt (F-skatt)?
--
-- Skattekalendern la ovillkorligt in "F-skatt (debiterad preliminärskatt)" den
-- 12:e varje månad (17:e i januari och augusti). För den som faktiskt har ett
-- beslut om debiterad preliminärskatt från Skatteverket är det rätt — men en
-- ny installation fick därmed fem oförklarade F-skattrader i Att göra-listan
-- redan innan någon frågat om företaget ens har ett sådant beslut. Datum som
-- ser ut att vara hämtade ur företagets egna uppgifter, men som i själva verket
-- var ett antagande, är precis den sortens sak man inte får bjuda på.
--
-- Tre lägen, därför en NULLBAR boolean:
--   true   ja        — F-skattdatumen genereras (dagens beteende)
--   false  nej       — inga F-skattrader alls
--   null   obesvarad — inga F-skattrader; Att göra visar i stället en mjuk rad
--                      som ber om svaret och länkar hit
--
-- Rättslig bakgrund: debiterad preliminärskatt betalas enligt 62 kap. 3 §
-- skatteförfarandelagen (2011:1244) senast den 12:e i månaden (17:e i januari
-- och augusti, 62 kap. 4 §) — men bara av den som har ett beslut om
-- debiterad preliminärskatt (55 kap. 2–3 §§). Antagandet var alltså inte bara
-- otydligt, det var i vissa fall fel.
alter table public.settings
  add column if not exists pays_f_tax boolean;

comment on column public.settings.pays_f_tax is
  'Har företaget beslut om debiterad preliminärskatt (F-skatt)? true = ja (skattekalendern visar betalningsdatumen), false = nej, null = obesvarad.';

-- Befintliga installationer ska INTE tystna vid uppdateringen: den som redan
-- kört klart onboardingen har sett F-skattdatumen sedan dag ett och kan ha
-- planerat efter dem. De får därför "ja" och kan svara nej i Inställningar.
--
-- En färsk databas har settings-raden från seeden med onboarded_at = null och
-- passerar därför den här uppdateringen — nya onboardingar får frågan i stället
-- för ett gissat svar.
update public.settings
   set pays_f_tax = true
 where onboarded_at is not null
   and pays_f_tax is null;

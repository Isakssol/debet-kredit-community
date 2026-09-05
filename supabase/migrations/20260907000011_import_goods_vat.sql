-- Varuimport från land utanför EU
-- ==============================
-- Momsen påförs vid införseln (tullräkning från Tullverket eller speditören),
-- inte genom omvänd skattskyldighet. Beskattningsunderlaget redovisas i ruta 50
-- och den utgående importmomsen i ruta 60–62 — Skatteverket, "Fylla i
-- momsdeklarationen", fält 50 "Beskattningsunderlag vid import" och fält 60–62.
--
-- Utan koderna hamnade en bokförd tullräkning varken i ruta 50 eller i ruta
-- 60–62: deklarationen saknade både underlaget och momsen, och
-- rimlighetskontrollen hade inget att jämföra.
insert into vat_codes (code, description, boxes) values
  ('PURCHASE_IMPORT',      'Import av varor från land utanför EU (underlag)',  '{"underlag": ["50"]}'),
  ('OUTPUT_VAT_IMPORT_25', 'Utgående moms import 25 %',                        '{"moms": ["60"]}'),
  ('OUTPUT_VAT_IMPORT_12', 'Utgående moms import 12 %',                        '{"moms": ["61"]}'),
  ('OUTPUT_VAT_IMPORT_6',  'Utgående moms import 6 %',                         '{"moms": ["62"]}')
on conflict (code) do nothing;

insert into accounts (number, name, vat_code, default_vat_rate, ne_field, blocked, description) values
  (2615, 'Utgående moms import av varor, 25 %', 'OUTPUT_VAT_IMPORT_25', null, null, false, 'Tullräkning/importmoms — ruta 60'),
  (4545, 'Import av varor, 25 % moms',          'PURCHASE_IMPORT',      null, 'R5', false, 'Beskattningsunderlag vid import — ruta 50')
on conflict (number) do update set vat_code = excluded.vat_code where accounts.vat_code is null;

update accounts set vat_code = 'OUTPUT_VAT_IMPORT_25' where number = 2615 and vat_code = 'OUTPUT_VAT_REVERSE';
update accounts set vat_code = 'OUTPUT_VAT_IMPORT_12' where number = 2625 and vat_code is null;
update accounts set vat_code = 'OUTPUT_VAT_IMPORT_6'  where number = 2635 and vat_code is null;

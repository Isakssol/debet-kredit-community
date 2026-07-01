-- ============================================================
-- Trimtech Bokföring — seed: momskoder, momssatser, regelvärden,
-- kontoplan (BAS 2026-urval för tjänsteföretag EF), räkenskapsår 2026
-- ============================================================

-- ---------- Momskoder (konto → momsdeklarationens rutor) ----------
insert into vat_codes (code, description, boxes) values
  ('SALES_25',            'Momspliktig försäljning 25 %',                    '{"underlag": ["05"], "moms": ["10"]}'),
  ('SALES_12',            'Momspliktig försäljning 12 %',                    '{"underlag": ["05"], "moms": ["11"]}'),
  ('SALES_6',             'Momspliktig försäljning 6 %',                     '{"underlag": ["05"], "moms": ["12"]}'),
  ('SALES_EU_GOODS',      'Varuförsäljning till annat EU-land',              '{"underlag": ["35"]}'),
  ('SALES_EU_SERVICES',   'Tjänsteförsäljning EU, omvänd skattskyldighet',   '{"underlag": ["39"]}'),
  ('SALES_EXPORT',        'Varuförsäljning utanför EU (export)',             '{"underlag": ["36"]}'),
  ('SALES_SERVICES_XEU',  'Tjänsteförsäljning utanför EU',                   '{"underlag": ["40"]}'),
  ('SALES_EXEMPT',        'Övrig momsfri försäljning',                       '{"underlag": ["42"]}'),
  ('PURCHASE_EU_GOODS',   'Inköp varor från annat EU-land',                  '{"underlag": ["20"]}'),
  ('PURCHASE_EU_SERVICES','Inköp tjänster från annat EU-land (huvudregeln)', '{"underlag": ["21"]}'),
  ('PURCHASE_SERVICES_XEU','Inköp tjänster från land utanför EU',            '{"underlag": ["22"]}'),
  ('OUTPUT_VAT_25',       'Utgående moms 25 %',                              '{"moms": ["10"]}'),
  ('OUTPUT_VAT_12',       'Utgående moms 12 %',                              '{"moms": ["11"]}'),
  ('OUTPUT_VAT_6',        'Utgående moms 6 %',                               '{"moms": ["12"]}'),
  ('OUTPUT_VAT_REVERSE',  'Utgående moms omvänd skattskyldighet 25 %',       '{"moms": ["30"]}'),
  ('INPUT_VAT',           'Ingående moms',                                   '{"moms": ["48"]}'),
  ('VAT_SETTLEMENT',      'Momsredovisning (ruta 49)',                       '{"moms": ["49"]}');

-- ---------- Momssatser (datumstyrda — satser får aldrig hårdkodas i appen) ----------
insert into vat_rates (rate_type, rate, valid_from, valid_to) values
  ('standard',   25.00, '2000-01-01', null),
  ('reduced_12', 12.00, '2000-01-01', null),
  ('reduced_6',   6.00, '2000-01-01', null),
  ('zero',        0.00, '2000-01-01', null);
-- OBS: livsmedel bytte kategori 12 % → 6 % per 2026-04-01 (t.o.m. 2027-12-31).
-- Det är en varukategori-fråga (användaren väljer sats per rad), inte en satsändring.

-- ---------- Regelvärden 2026 ----------
insert into rule_values (key, value, valid_from, valid_to, description) values
  ('prisbasbelopp',                59200,   '2026-01-01', '2026-12-31', 'Prisbasbelopp'),
  ('prisbasbelopp_forhojt',        60500,   '2026-01-01', '2026-12-31', 'Förhöjt prisbasbelopp'),
  ('inkomstbasbelopp',             83400,   '2026-01-01', '2026-12-31', 'Inkomstbasbelopp'),
  ('egenavgifter_full',            28.97,   '2026-01-01', '2026-12-31', 'Egenavgifter full sats %'),
  ('egenavgifter_nedsattning_pct', 7.5,     '2026-01-01', '2026-12-31', 'Generell nedsättning % av underlaget'),
  ('egenavgifter_nedsattning_max', 15000,   '2026-01-01', '2026-12-31', 'Max nedsättning kr/år'),
  ('egenavgifter_nedsattning_krav',40000,   '2026-01-01', '2026-12-31', 'Kräver överskott över'),
  ('schablonavdrag_egenavgifter',  25,      '2026-01-01', '2026-12-31', 'Schablonavdrag egenavgifter % (NE R43)'),
  ('periodiseringsfond_pct',       30,      '2026-01-01', '2026-12-31', 'Periodiseringsfond max % (EF)'),
  ('rantefordelning_positiv',      8.55,    '2026-01-01', '2026-12-31', 'Positiv räntefördelning % (SLR 2,55 + 6)'),
  ('rantefordelning_negativ',      3.55,    '2026-01-01', '2026-12-31', 'Negativ räntefördelning % (SLR + 1)'),
  ('rantefordelning_grans',        50000,   '2026-01-01', '2026-12-31', 'Kapitalunderlagsgräns räntefördelning'),
  ('expansionsfond_skatt',         20.6,    '2026-01-01', '2026-12-31', 'Expansionsfondsskatt %'),
  ('expansionsfond_tak_pct',       125.94,  '2026-01-01', '2026-12-31', 'Tak % av kapitalunderlag'),
  ('milersattning',                25,      '2026-01-01', '2026-12-31', 'Skattefri milersättning egen bil kr/mil'),
  ('traktamente_helt',             300,     '2026-01-01', '2026-12-31', 'Traktamente inrikes helt maximibelopp'),
  ('traktamente_halvt',            150,     '2026-01-01', '2026-12-31', 'Traktamente halv dag'),
  ('traktamente_natt',             150,     '2026-01-01', '2026-12-31', 'Nattraktamente'),
  ('representation_moms_underlag', 300,     '2026-01-01', '2026-12-31', 'Momslyft representation, max underlag kr/person'),
  ('representation_enklare',       60,      '2026-01-01', '2026-12-31', 'Enklare förtäring avdragsgill kr/person'),
  ('direktavdrag_inventarier',     29600,   '2026-01-01', '2026-12-31', 'Direktavdrag inventarier < halvt prisbasbelopp'),
  ('skiktgrans_statlig',           660400,  '2026-01-01', '2026-12-31', 'Skiktgräns statlig inkomstskatt'),
  ('statlig_skatt_pct',            20,      '2026-01-01', '2026-12-31', 'Statlig inkomstskatt %'),
  ('forenklat_arsbokslut_grans',   3000000, '2026-01-01', null,         'Omsättningsgräns förenklat årsbokslut/kontantmetod'),
  ('momsbefrielse_grans',          120000,  '2026-01-01', null,         'Omsättningsgräns momsbefrielse');

-- ---------- Kontoplan: BAS 2026-urval för enskild firma (tjänsteföretag) ----------
-- (number, name, vat_code, default_vat_rate, ne_field, blocked, description)
insert into accounts (number, name, vat_code, default_vat_rate, ne_field, blocked, description) values
-- Klass 1 — Tillgångar
  (1220, 'Inventarier och verktyg',                null, null, 'B4', false, null),
  (1229, 'Ackumulerade avskrivningar inventarier', null, null, 'B4', false, null),
  (1250, 'Datorer',                                null, null, 'B4', false, null),
  (1259, 'Ackumulerade avskrivningar datorer',     null, null, 'B4', false, null),
  (1510, 'Kundfordringar',                         null, null, 'B7', false, 'Styrs normalt av faktureringsmodulen'),
  (1630, 'Avräkning för skatter och avgifter (skattekonto)', null, null, 'B8', false, 'Används normalt inte i enskild firma — privata skatteposter går via 2012'),
  (1650, 'Momsfordran',                            null, null, 'B8', false, null),
  (1680, 'Andra kortfristiga fordringar',          null, null, 'B8', false, null),
  (1710, 'Förutbetalda hyreskostnader',            null, null, 'B8', false, null),
  (1730, 'Förutbetalda försäkringspremier',        null, null, 'B8', false, null),
  (1790, 'Övriga förutbetalda kostnader och upplupna intäkter', null, null, 'B8', false, null),
  (1910, 'Kassa',                                  null, null, 'B9', false, null),
  (1920, 'PlusGiro',                               null, null, 'B9', false, null),
  (1930, 'Företagskonto',                          null, null, 'B9', false, null),
  (1940, 'Övriga bankkonton',                      null, null, 'B9', false, null),
-- Klass 2 — Eget kapital (EF) och skulder
  (2010, 'Eget kapital',                           null, null, 'B10', false, 'Nollställs mot vid årsavslut'),
  (2011, 'Egna varuuttag',                         null, null, 'B10', false, null),
  (2012, 'Avräkning för skatter och avgifter (egna)', null, null, 'B10', false, 'F-skatt/preliminärskatt = eget uttag, ALDRIG kostnad'),
  (2013, 'Övriga egna uttag',                      null, null, 'B10', false, null),
  (2018, 'Övriga egna insättningar',               null, null, 'B10', false, null),
  (2019, 'Årets resultat',                         null, null, 'B10', true,  'Bokförs endast av årsavslutet (motkonto 8999)'),
  (2440, 'Leverantörsskulder',                     null, null, 'B15', false, 'Styrs normalt av leverantörsmodulen'),
  (2611, 'Utgående moms försäljning Sverige 25 %', 'OUTPUT_VAT_25', null, 'B14', false, null),
  (2614, 'Utgående moms omvänd skattskyldighet 25 %', 'OUTPUT_VAT_REVERSE', null, 'B14', false, 'EU-förvärv/import av tjänster'),
  (2621, 'Utgående moms försäljning Sverige 12 %', 'OUTPUT_VAT_12', null, 'B14', false, null),
  (2631, 'Utgående moms försäljning Sverige 6 %',  'OUTPUT_VAT_6', null, 'B14', false, null),
  (2640, 'Ingående moms',                          'INPUT_VAT', null, 'B14', false, null),
  (2645, 'Beräknad ingående moms på förvärv från utlandet', 'INPUT_VAT', null, 'B14', false, null),
  (2650, 'Redovisningskonto för moms',             'VAT_SETTLEMENT', null, 'B14', true, 'Bokförs endast av momsrapporten'),
  (2890, 'Övriga kortfristiga skulder',            null, null, 'B16', false, null),
  (2990, 'Upplupna kostnader och förutbetalda intäkter', null, null, 'B16', false, null),
-- Klass 3 — Intäkter
  (3001, 'Försäljning varor Sverige 25 %',         'SALES_25', 25, 'R1', false, null),
  (3011, 'Försäljning tjänster Sverige 25 %',      'SALES_25', 25, 'R1', false, 'Standardkonto för trimtechs tjänsteförsäljning'),
  (3105, 'Försäljning varor till land utanför EU', 'SALES_EXPORT', 0, 'R2', false, null),
  (3106, 'Försäljning varor till annat EU-land',   'SALES_EU_GOODS', 0, 'R2', false, 'Kräver köparens VAT-nr + periodisk sammanställning'),
  (3305, 'Försäljning tjänster till land utanför EU', 'SALES_SERVICES_XEU', 0, 'R2', false, null),
  (3308, 'Försäljning tjänster till annat EU-land','SALES_EU_SERVICES', 0, 'R2', false, 'Omvänd skattskyldighet, huvudregeln. Kräver periodisk sammanställning'),
  (3540, 'Faktureringsavgifter',                   'SALES_25', 25, 'R1', false, null),
  (3590, 'Övriga fakturerade kostnader',           'SALES_25', 25, 'R1', false, null),
  (3740, 'Öres- och kronutjämning',                null, null, 'R1', false, 'Öresavrundning på fakturor'),
  (3910, 'Hyres- och arrendeintäkter',             'SALES_EXEMPT', 0, 'R2', false, null),
  (3973, 'Vinst vid avyttring av maskiner och inventarier', null, null, 'R2', false, null),
  (3990, 'Övriga ersättningar och intäkter',       null, null, 'R2', false, null),
-- Klass 4 — Inköp (BAS 2026-struktur, verifieras mot officiella Excel-filen)
  (4010, 'Inköp material och varor',               null, 25, 'R5', false, null),
  (4515, 'Inköp varor från annat EU-land 25 %',    'PURCHASE_EU_GOODS', 25, 'R5', false, 'Omvänd moms: 2614 + 2645 bokförs automatiskt'),
  (4531, 'Inköp tjänster från land utanför EU 25 %', 'PURCHASE_SERVICES_XEU', 25, 'R5', false, 'Omvänd moms: 2614 + 2645'),
  (4535, 'Inköp tjänster från annat EU-land 25 %', 'PURCHASE_EU_SERVICES', 25, 'R5', false, 'Omvänd moms: 2614 + 2645'),
  (4600, 'Legoarbeten och underentreprenader',     null, 25, 'R5', false, null),
-- Klass 5–6 — Övriga externa kostnader
  (5010, 'Lokalhyra',                              null, 25, 'R6', false, 'Arbetsrum i bostad: skattemässig justering i NE, bokförs ej här'),
  (5220, 'Hyra av inventarier och verktyg',        null, 25, 'R6', false, null),
  (5250, 'Hyra av datorer',                        null, 25, 'R6', false, null),
  (5410, 'Förbrukningsinventarier',                null, 25, 'R6', false, 'Inventarier < 29 600 kr (2026) eller < 3 års livslängd'),
  (5420, 'Programvaror',                           null, 25, 'R6', false, null),
  (5460, 'Förbrukningsmaterial',                   null, 25, 'R6', false, null),
  (5480, 'Arbetskläder och skyddsmaterial',        null, 25, 'R6', false, null),
  (5611, 'Drivmedel personbilar',                  null, 25, 'R6', false, null),
  (5612, 'Försäkring och skatt personbilar',       null, 0,  'R6', false, null),
  (5613, 'Reparation och underhåll personbilar',   null, 25, 'R6', false, null),
  (5615, 'Leasing personbilar',                    null, 25, 'R6', false, 'Endast halva momsen avdragsgill på personbilsleasing'),
  (5800, 'Resekostnader',                          null, null, 'R6', false, 'Milersättning egen bil bokförs här (25 kr/mil 2026)'),
  (5810, 'Biljetter',                              null, 6,  'R6', false, null),
  (5831, 'Kost och logi Sverige',                  null, 12, 'R6', false, null),
  (5910, 'Annonsering',                            null, 25, 'R6', false, null),
  (6071, 'Representation, avdragsgill',            null, null, 'R6', false, 'Enklare förtäring ≤ 60 kr/person. Momslyft max underlag 300 kr/person'),
  (6072, 'Representation, ej avdragsgill',         null, null, 'R6', false, 'Återläggs i NE (R14-justering)'),
  (6110, 'Kontorsmaterial',                        null, 25, 'R6', false, null),
  (6212, 'Mobiltelefon',                           null, 25, 'R6', false, null),
  (6230, 'Datakommunikation',                      null, 25, 'R6', false, null),
  (6250, 'Porto',                                  null, 25, 'R6', false, null),
  (6310, 'Företagsförsäkringar',                   null, 0,  'R6', false, 'Försäkringar är momsfria'),
  (6530, 'Redovisningstjänster',                   null, 25, 'R6', false, null),
  (6540, 'IT-tjänster',                            null, 25, 'R6', false, 'Molntjänster/SaaS. Utländska leverantörer (t.ex. USA): använd 4531'),
  (6550, 'Konsultarvoden',                         null, 25, 'R6', false, null),
  (6570, 'Bankkostnader',                          null, 0,  'R6', false, 'Banktjänster är momsfria'),
  (6590, 'Övriga externa tjänster',                null, 25, 'R6', false, null),
  (6970, 'Tidningar, tidskrifter och facklitteratur', null, 6, 'R6', false, null),
  (6981, 'Föreningsavgifter, avdragsgilla',        null, 0,  'R6', false, 'Serviceavgifter'),
  (6982, 'Föreningsavgifter, ej avdragsgilla',     null, 0,  'R6', false, 'Medlemsavgifter — återläggs i NE'),
  (6991, 'Övriga externa kostnader, avdragsgilla', null, 25, 'R6', false, null),
  (6992, 'Övriga externa kostnader, ej avdragsgilla', null, 0, 'R6', false, 'Återläggs i NE'),
-- Klass 7 — Avskrivningar m.m. (inga lönekonton: EF utan anställda)
  (7832, 'Avskrivningar på inventarier och verktyg', null, null, 'R9', false, null),
  (7835, 'Avskrivningar på datorer',               null, null, 'R9', false, null),
  (7973, 'Förlust vid avyttring av maskiner och inventarier', null, null, 'R6', false, null),
-- Klass 8 — Finansiellt och resultat
  (8310, 'Ränteintäkter',                          null, null, 'R4', false, null),
  (8410, 'Räntekostnader',                         null, null, 'R8', false, null),
  (8423, 'Kostnadsränta skattekonto',              null, null, 'R8', false, 'Ej avdragsgill — återläggs i NE'),
  (8999, 'Årets resultat',                         null, null, null, true, 'Bokförs endast av årsavslutet (motkonto 2019)');

-- ---------- Företagsinställningar (kompletteras i appen) ----------
insert into settings (id, company_name, vat_period, default_accounting_method)
values (1, 'Oliver Isaksson (trimtech)', 'kvartal', 'faktureringsmetoden');

-- ---------- Räkenskapsår 2026 + verifikationsserier ----------
insert into fiscal_years (year, start_date, end_date, accounting_method)
values (2026, '2026-01-01', '2026-12-31', 'faktureringsmetoden');

insert into verification_series (fiscal_year_id, code, name, manual_entry)
select fy.id, s.code, s.name, s.manual
from fiscal_years fy,
     (values ('A', 'Manuella verifikat', true),
             ('B', 'Kundfakturor', false),
             ('C', 'Leverantörsfakturor', false),
             ('D', 'Moms och omföringar', false),
             ('E', 'Bokslut', false)) as s(code, name, manual)
where fy.year = 2026;

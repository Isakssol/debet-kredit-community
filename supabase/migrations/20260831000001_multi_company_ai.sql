-- Bolagstyp + AI-inställningar (nyckel, modell, egna konteringsregler)
-- company_type styr AI-regler och vilka årsavslutsflöden som erbjuds.
alter table settings
  add column if not exists company_type text not null default 'enskild_firma'
    check (company_type in ('enskild_firma', 'aktiebolag', 'handelsbolag')),
  add column if not exists ai_api_key text,
  add column if not exists ai_model text,
  add column if not exists ai_rules text;

comment on column settings.ai_api_key is
  'API-nyckel för AI-bokföraren (Anthropic sk-ant-… eller OpenAI sk-…). Lagras i klartext i databasen — använd en nyckel med utgiftstak. Miljövariabeln ANTHROPIC_API_KEY/OPENAI_API_KEY används som fallback.';
comment on column settings.ai_rules is
  'Företagets egna konteringsregler i fritext. Injiceras i AI-bokförarens systemprompt så förslagen följer husets konventioner.';

-- Konton för aktiebolag och handelsbolag (additiva; EF-installationer påverkas inte).
-- ne_field är null — NE-bilagan gäller bara enskild firma.
insert into accounts (number, name, vat_code, default_vat_rate, ne_field, blocked, description) values
  (2081, 'Aktiekapital',                                null, null, null, false, 'Endast aktiebolag'),
  (2091, 'Balanserad vinst eller förlust',              null, null, null, false, 'Endast aktiebolag'),
  (2093, 'Erhållna aktieägartillskott',                 null, null, null, false, 'Endast aktiebolag'),
  (2098, 'Vinst eller förlust från föregående år',      null, null, null, false, 'Endast aktiebolag'),
  (2099, 'Årets resultat (aktiebolag)',                 null, null, null, false, 'Motsvarar 2019 i enskild firma'),
  (2510, 'Skatteskulder',                               null, null, null, false, 'Bolagsskatt m.m. — aktiebolag'),
  (2710, 'Personalskatt',                               null, null, null, false, 'Innehållen preliminärskatt på löner'),
  (2731, 'Avräkning lagstadgade sociala avgifter',      null, null, null, false, 'Arbetsgivaravgifter att betala'),
  (2893, 'Skulder till närstående personer/aktieägare', null, null, null, false, 'Privata utlägg för bolagets räkning bokas hit (AB), inte mot 2018'),
  (2898, 'Outtagen vinstutdelning',                     null, null, null, false, 'Beslutad men ej utbetald utdelning'),
  (2020, 'Eget kapital, delägare 2',                    null, null, null, false, 'Endast handelsbolag'),
  (7210, 'Löner till tjänstemän',                       null, null, null, false, 'Endast bolag med anställda'),
  (7510, 'Lagstadgade sociala avgifter',                null, null, null, false, 'Arbetsgivaravgifter — kostnadssidan'),
  (7690, 'Övriga personalkostnader',                    null, null, null, false, null),
  (8910, 'Skatt på årets resultat',                     null, null, null, false, 'Bolagsskatt — endast aktiebolag')
on conflict (number) do nothing;

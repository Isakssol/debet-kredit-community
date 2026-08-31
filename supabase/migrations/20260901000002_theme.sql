-- Utseende: valbar accentfärg och bakgrundston (null = standard, Wint-ljus korall)
alter table settings
  add column if not exists theme_accent text,
  add column if not exists theme_background text;

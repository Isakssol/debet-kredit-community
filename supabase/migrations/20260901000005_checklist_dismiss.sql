-- Kom igång-checklistan: bortklickade steg + möjlighet att dölja hela listan
alter table settings
  add column if not exists dismissed_checklist_steps jsonb,
  add column if not exists checklist_hidden boolean not null default false;

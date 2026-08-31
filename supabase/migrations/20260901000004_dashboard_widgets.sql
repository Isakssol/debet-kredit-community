-- Anpassningsbar översikt: användarens valda widgets (null = standarduppsättning)
alter table settings
  add column if not exists dashboard_widgets jsonb;

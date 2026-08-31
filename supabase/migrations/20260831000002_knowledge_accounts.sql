-- Konton som AI:ns utökade kunskapsbas hänvisar till
insert into accounts (number, name, vat_code, default_vat_rate, ne_field, blocked, description) values
  (5616, 'Trängselskatt',                            null, null, 'R6', false, 'Avdragsgill vid tjänsteresa, momsfri'),
  (6351, 'Konstaterade förluster på kundfordringar', null, null, 'R6', false, 'Vid konkurs/utmätning — utgående moms får återtas'),
  (6352, 'Befarade förluster på kundfordringar',     null, null, 'R6', false, 'Nedskrivning utan momsjustering')
on conflict (number) do nothing;

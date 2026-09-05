-- Utlägg, milersättning och traktamente i aktiebolag/handelsbolag krediterar 2820
-- (skuld till anställd/ägare) — kontot saknades i den seedade kontoplanen och
-- bokningen stoppades med "Konto 2820 finns inte eller är inaktivt".
-- Kontonumret och benämningen följer BAS-kontoplanen.
insert into accounts (number, name, description, active, blocked)
values (2820, 'Kortfristiga skulder till anställda', 'Utlägg, milersättning och traktamente som ska betalas ut', true, false)
on conflict (number) do update set active = true where accounts.active = false;

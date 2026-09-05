-- Härdning efter Supabase-lintern: lås search_path på alla interna funktioner
-- (skydd mot search_path-kapning). En trigger- eller hjälpfunktion utan låst
-- search_path kör med anroparens sökväg, och en tabell med samma namn i ett
-- schema som ligger före public gör då att vakten läser fel data.
--
-- Demo-funktionerna finns bara på demo-instansen — de villkoras med
-- to_regprocedure så att migrationen fungerar på alla installationer.

alter function public.is_period_locked(p_date date) set search_path = public, pg_temp;
alter function public.verifications_block_update() set search_path = public, pg_temp;
alter function public.verifications_restrict_delete() set search_path = public, pg_temp;
alter function public.verification_rows_block_mutation() set search_path = public, pg_temp;
alter function public.attachments_restrict_delete() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.invoices_guard_update() set search_path = public, pg_temp;
alter function public.invoice_rows_guard() set search_path = public, pg_temp;
alter function public.invoices_restrict_delete() set search_path = public, pg_temp;
alter function public.vat_reports_guard() set search_path = public, pg_temp;

do $$
begin
  if to_regprocedure('public.demo_reset()') is not null then
    revoke execute on function public.demo_reset() from public, anon, authenticated;
    alter function public.demo_reset() set search_path = public, pg_temp;
  end if;
  if to_regprocedure('public.demo_seed()') is not null then
    revoke execute on function public.demo_seed() from public, anon, authenticated;
    alter function public.demo_seed() set search_path = public, pg_temp;
  end if;
  if to_regprocedure('public.demo_settings_extra_reset()') is not null then
    revoke execute on function public.demo_settings_extra_reset() from public, anon, authenticated;
    alter function public.demo_settings_extra_reset() set search_path = public, pg_temp;
  end if;
end $$;

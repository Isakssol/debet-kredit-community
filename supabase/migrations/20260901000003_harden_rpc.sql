-- Säkerhetshärdning: bokförings-RPC:erna är SECURITY DEFINER (kringgår RLS)
-- och ska aldrig kunna anropas oautentiserat via PostgREST.
revoke execute on function public.book_verification(text, date, text, jsonb, text, text, uuid) from anon, public;
revoke execute on function public.correct_verification(uuid, date, text, jsonb, text) from anon, public;
revoke execute on function public.assign_invoice_no() from anon, public;
grant execute on function public.book_verification(text, date, text, jsonb, text, text, uuid) to authenticated, service_role;
grant execute on function public.correct_verification(uuid, date, text, jsonb, text) to authenticated, service_role;
grant execute on function public.assign_invoice_no() to authenticated, service_role;

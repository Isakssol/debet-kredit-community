-- ============================================================
-- Egen logotyp: lagringsplats och behörigheter
--
-- settings.logo_path finns sedan kärnschemat (20260701000001) men har aldrig
-- haft någon lagringsplats — här skapas bucketen och behörigheterna för den.
--
-- ANPASSNING. Licensutgåvan villkorar policyerna nedan på app_role(): läsning
-- för alla med roll, skrivning bara för admin. Den här utgåvan har ingen
-- rollhierarki — en installation, en inloggning — så villkoret är att någon ÄR
-- inloggad, precis som för underlagsbucketen (20260701000003). Byråns
-- maskinkonton är redan utestängda ur hela storage.objects av den restriktiva
-- policyn "byra aldrig underlag" (20260907000012), som gäller varje bucket.
-- ============================================================

-- ---------- Storage: privat bucket för logotypen ----------
-- Privat som kvittoarkivet: appen skapar signerade länkar vid visning.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 1048576,
        array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update
  set public = false,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/svg+xml'];

-- Läsning: logotypen syns överst i menyn på varje sida.
drop policy if exists "authenticated read branding" on storage.objects;
create policy "authenticated read branding" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding');

drop policy if exists "authenticated upload branding" on storage.objects;
create policy "authenticated upload branding" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding');

drop policy if exists "authenticated update branding" on storage.objects;
create policy "authenticated update branding" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding')
  with check (bucket_id = 'branding');

-- Radering: logotypen är utbytbar och omfattas inte av arkiveringskravet, till
-- skillnad från underlagen. Den gamla filen städas bort när en ny sparats.
drop policy if exists "authenticated delete branding" on storage.objects;
create policy "authenticated delete branding" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding');

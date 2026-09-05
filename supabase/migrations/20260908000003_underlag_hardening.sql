-- Kvittoarkivet: sjuårsskyddet ska gälla i databasen och i Storage, inte bara
-- i appkoden. Kärnschemat har redan triggern attachments_restrict_delete
-- (20260701000001) och enkelriktningen attachments_guard_update
-- (20260907000005). Det som saknas är gränserna kring själva bucketen och
-- radering via lagrings-API:t, som går förbi tabellen helt.
--
-- Källa: BFL (1999:1078) 7 kap. 2 § och 7 kap. 6 §.
-- https://lagen.nu/1999:1078#K7P2

-- ---------- 1. Bucketens gränser ----------
-- Bucketen skapades utan tak (20260701000003). 25 MB räcker för ett inskannat
-- kvitto eller en fakturabunt; MIME-listan är de format inkorgen faktiskt tar
-- emot. Webbläsare lämnar ibland typen tom vid uppladdning från kamerarullen,
-- och Storage sätter då application/octet-stream — därför står den med.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array[
         'application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
         'application/octet-stream'
       ]
 where id = 'underlag';

-- ---------- 2. Snabb uppslagning på lagringsnyckel ----------
-- Kopplingarna, arkivexporten och policyn längre ned slår alla upp på
-- storage_path. Utan index blir det en sekventiell genomsökning per fil.
create index if not exists attachments_storage_path_idx on attachments (storage_path);

-- ---------- 3. Storage: bara okopplade objekt får raderas ----------
-- Den befintliga policyn (20260701000006) släpper igenom varje DELETE i
-- bucketen. Tabellraden är skyddad av triggern, men filen bakom den kunde tas
-- bort direkt via lagrings-API:t och verifikatet stod kvar utan underlag.
-- Inkorgen fungerar som förut: en fil som ingenting pekar på får städas bort.
--
-- ANPASSNING. Licensutgåvan villkorar dessutom på app_role() in
-- ('admin','medarbetare') och undantar rader i suggestion_queue. Den här
-- utgåvan har varken rollhierarki eller AI-förslagskö, så villkoret är att
-- någon ÄR inloggad och kopplingarna som prövas är verifikat och
-- leverantörsfaktura — de två som finns här.
drop policy if exists "authenticated delete underlag" on storage.objects;
drop policy if exists "authenticated delete unlinked underlag" on storage.objects;
create policy "authenticated delete unlinked underlag" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'underlag'
    and not exists (
      select 1 from public.attachments a
      where a.storage_path = storage.objects.name and a.verification_id is not null)
    and not exists (
      select 1 from public.supplier_invoices s where s.attachment_path = storage.objects.name)
  );

-- Public bucket for court photos uploaded by admins.
-- Readable by anyone with the URL (matches how courts.photo_urls already work).
-- Writes are restricted to authenticated users whose path prefix matches their
-- own user id, so each admin's uploads live under `<admin_user_id>/...`.
-- (Supabase Storage enforces path-based ownership via storage.foldername().)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'court-photos',
  'court-photos',
  true,
  10485760,  -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Public read: anyone can view court photos
drop policy if exists court_photos_public_read on storage.objects;
create policy court_photos_public_read on storage.objects
  for select to public
  using (bucket_id = 'court-photos');

-- Authenticated insert: path must start with the uploader's own user id
drop policy if exists court_photos_owner_insert on storage.objects;
create policy court_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'court-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Authenticated update (for upsert=true on re-uploads)
drop policy if exists court_photos_owner_update on storage.objects;
create policy court_photos_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'court-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'court-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Authenticated delete (lets admins remove old photos)
drop policy if exists court_photos_owner_delete on storage.objects;
create policy court_photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'court-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

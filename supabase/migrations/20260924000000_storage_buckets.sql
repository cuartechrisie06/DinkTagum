-- Storage for profile avatars and community post photos. Both buckets are
-- public (readable by anyone with the URL, no auth token needed) — this
-- matches how `courts.photo_urls`/`profiles.avatar_url` already work today as
-- plain public URL strings rendered directly via <Image>. Writes are
-- restricted to each user's own folder (path prefix `<user_id>/...`), the
-- standard Supabase Storage RLS pattern using storage.foldername().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-photos', 'post-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists post_photos_public_read on storage.objects;
create policy post_photos_public_read on storage.objects for select to public
  using (bucket_id = 'post-photos');

drop policy if exists post_photos_owner_write on storage.objects;
create policy post_photos_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists post_photos_owner_update on storage.objects;
create policy post_photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists post_photos_owner_delete on storage.objects;
create policy post_photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Background photos: each person can pick a photo to show behind the calendar.
--
-- The photo lives in a private Storage bucket at `<user id>/background.jpg`.
-- Each person can only read, replace and delete the file in their own folder,
-- so the choice follows their login from phone to computer. The app shrinks
-- photos before uploading, so 3 MB is plenty and keeps well inside the free
-- tier's 1 GB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backgrounds', 'backgrounds', false, 3145728, array['image/jpeg']);

create policy "backgrounds: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "backgrounds: add own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "backgrounds: replace own"
  on storage.objects for update to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "backgrounds: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);

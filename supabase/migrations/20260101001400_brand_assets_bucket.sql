-- Public read-only Storage bucket for RelayNest brand assets used in emails
-- (Supabase Auth email templates, Supabase Dashboard Preview, Gmail, Outlook).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 1048576, array['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "brand public read" on storage.objects;
create policy "brand public read"
  on storage.objects for select
  to public
  using (bucket_id = 'brand');

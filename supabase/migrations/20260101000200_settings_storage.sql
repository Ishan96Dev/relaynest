-- Per-user settings, workspace logo, and Storage buckets for profile pictures and workspace logos.

-- ---------- user settings (Settings > Preferences / Notifications) ----------
create table if not exists public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('preferences', 'notifications')),
  value jsonb not null default '{}'::jsonb check (pg_column_size(value) < 16384),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create trigger user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
create policy "own settings read" on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own settings insert" on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own settings update" on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;

-- ---------- workspace logo ----------
alter table public.workspaces add column if not exists logo_path text;

-- Unread badge in the header: members read their own rows, so an index keeps the head count cheap.
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------- storage buckets ----------
-- Both buckets are public-read (images are shown in the header and sidebar without a signed-URL round trip).
-- Object names are unguessable (timestamped) and writes are restricted by the policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg']),
  ('workspace-logos', 'workspace-logos', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True when the first folder of an object name is a workspace the caller owns or administers.
create or replace function public.can_manage_workspace_object(object_name text) returns boolean
language plpgsql stable security invoker set search_path = public, storage as $$
begin
  return public.is_workspace_member(((storage.foldername(object_name))[1])::uuid, array['owner', 'admin']);
exception when others then
  return false; -- first folder is not a uuid
end $$;
revoke all on function public.can_manage_workspace_object(text) from public, anon;
grant execute on function public.can_manage_workspace_object(text) to authenticated;

-- avatars/<user_id>/<file>: a user manages only their own folder.
create policy "avatars own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- workspace-logos/<workspace_id>/<file>: owners and admins of that workspace.
create policy "logos admin read" on storage.objects for select to authenticated
  using (bucket_id = 'workspace-logos' and public.can_manage_workspace_object(name));
create policy "logos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'workspace-logos' and public.can_manage_workspace_object(name));
create policy "logos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'workspace-logos' and public.can_manage_workspace_object(name))
  with check (bucket_id = 'workspace-logos' and public.can_manage_workspace_object(name));
create policy "logos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'workspace-logos' and public.can_manage_workspace_object(name));

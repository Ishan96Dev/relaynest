-- Ensure public.user_settings supports user-initiated reset (DELETE RLS) and backfills missing `theme` in stored preferences.

drop policy if exists "own settings delete" on public.user_settings;
create policy "own settings delete" on public.user_settings for delete to authenticated
  using (user_id = (select auth.uid()));

grant delete on public.user_settings to authenticated;

-- Backfill `theme` on existing preferences rows so Appearance theme is synced from Supabase DB too.
update public.user_settings
set value = jsonb_set(value, '{theme}', '"dark"'::jsonb, true)
where key = 'preferences'
  and not (value ? 'theme');

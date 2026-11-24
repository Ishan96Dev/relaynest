-- Workspace description and co-member profile visibility.

alter table public.workspaces
  add column if not exists description text check (description is null or char_length(description) <= 250);

-- Members of the same workspace may read each other's profile (display name, avatar path only;
-- email lives in auth.users and is not exposed).
create policy "co-members read profiles" on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.workspace_members wm
    where wm.user_id = profiles.id and public.is_workspace_member(wm.workspace_id)
  )
);
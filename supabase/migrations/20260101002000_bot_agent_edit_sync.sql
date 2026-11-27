-- Align bots, ai_agents, and bot_history schemas for clean two-way editing and lifecycle audit.

-- 1. Allow 'updated' lifecycle snapshots in public.bot_history and harden grants / RLS.
alter table public.bot_history
  drop constraint if exists bot_history_event_check;

alter table public.bot_history
  add constraint bot_history_event_check
  check (event in ('created', 'updated', 'deleted', 'deleted_on_telegram'));

revoke all on public.bot_history from anon, authenticated;
grant select, insert on public.bot_history to authenticated;

drop policy if exists "bot_history_select_member" on public.bot_history;
create policy "bot_history_select_member" on public.bot_history
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "bot_history_insert_member" on public.bot_history;
create policy "bot_history_insert_member" on public.bot_history
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));

-- 2. Align ai_agents welcome/fallback message lengths with bots (4096 chars) so two-way edits never fail check constraints.
alter table public.ai_agents
  drop constraint if exists ai_agents_welcome_message_check,
  drop constraint if exists ai_agents_fallback_message_check;

alter table public.ai_agents
  add constraint ai_agents_welcome_message_check
    check (welcome_message is null or char_length(welcome_message) <= 4096),
  add constraint ai_agents_fallback_message_check
    check (fallback_message is null or char_length(fallback_message) <= 4096);

-- 3. Speed up workspace + bot_id lookups when linking Bots and AI Agents in My Bots.
create index if not exists ai_agents_workspace_bot_idx
  on public.ai_agents (workspace_id, bot_id)
  where bot_id is not null;

-- 4. One-time backfill to align linked bots & ai_agents shared fields (category/description/welcome/fallback).
update public.bots b
set
  category = coalesce(nullif(b.category, ''), a.category),
  description = coalesce(nullif(b.description, ''), a.description),
  welcome_message = coalesce(b.welcome_message, a.welcome_message),
  default_response = coalesce(b.default_response, a.fallback_message)
from public.ai_agents a
where a.bot_id = b.id
  and a.workspace_id = b.workspace_id
  and (
    coalesce(b.category, '') = ''
    or coalesce(b.description, '') = ''
    or (b.welcome_message is null and a.welcome_message is not null)
    or (b.default_response is null and a.fallback_message is not null)
  );

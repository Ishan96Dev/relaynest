-- Bot lifecycle history: records created bots, deleted bots, bots removed externally on Telegram,
-- what each bot was used for, and its saved command / model configuration snapshot.

create table if not exists public.bot_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  bot_id uuid,
  bot_name text not null,
  telegram_username text,
  event text not null check (event in ('created', 'deleted', 'deleted_on_telegram')),
  used_for text not null default '',
  category text,
  description text,
  config_snapshot jsonb not null default '{}'::jsonb,
  messages_count integer not null default 0,
  actor_id uuid references public.profiles (id) on delete set null,
  bot_created_at timestamptz,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_bot_history_workspace_occurred
  on public.bot_history (workspace_id, occurred_at desc);

alter table public.bot_history enable row level security;

drop policy if exists "bot_history_select_member" on public.bot_history;
create policy "bot_history_select_member" on public.bot_history
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = bot_history.workspace_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "bot_history_insert_member" on public.bot_history;
create policy "bot_history_insert_member" on public.bot_history
  for insert with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = bot_history.workspace_id and m.user_id = auth.uid()
    )
  );

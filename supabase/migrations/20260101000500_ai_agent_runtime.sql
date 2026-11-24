-- AI Agent runtime: configuration, knowledge sources, conversation memory and the Telegram bot link.

-- ---------- agent configuration ----------
alter table public.ai_agents
  add column if not exists instructions text not null default '' check (char_length(instructions) <= 8000),
  add column if not exists welcome_message text check (welcome_message is null or char_length(welcome_message) <= 1000),
  add column if not exists fallback_message text check (fallback_message is null or char_length(fallback_message) <= 1000),
  add column if not exists temperature numeric(3, 2) not null default 0.5 check (temperature between 0 and 1),
  add column if not exists max_tokens integer not null default 1024 check (max_tokens between 64 and 4096),
  add column if not exists memory_turns integer not null default 10 check (memory_turns between 0 and 30),
  add column if not exists tools jsonb not null default '{}'::jsonb check (pg_column_size(tools) < 4096),
  add column if not exists bot_id uuid references public.bots(id) on delete set null;

alter table public.ai_agents drop constraint if exists ai_agents_status_check;
alter table public.ai_agents add constraint ai_agents_status_check check (status in ('draft', 'active', 'inactive', 'error'));
create unique index if not exists ai_agents_bot_idx on public.ai_agents (bot_id) where bot_id is not null;

-- ---------- knowledge sources (text the agent may use when answering) ----------
create table if not exists public.ai_agent_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index if not exists ai_agent_knowledge_agent_idx on public.ai_agent_knowledge (agent_id, created_at);
alter table public.ai_agent_knowledge enable row level security;
create policy "members read" on public.ai_agent_knowledge for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins insert" on public.ai_agent_knowledge for insert to authenticated
  with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
create policy "admins update" on public.ai_agent_knowledge for update to authenticated
  using (public.is_workspace_member(workspace_id, array['owner', 'admin']))
  with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
create policy "admins delete" on public.ai_agent_knowledge for delete to authenticated
  using (public.is_workspace_member(workspace_id, array['owner', 'admin']));
revoke all on public.ai_agent_knowledge from anon, authenticated;
grant select, insert, update, delete on public.ai_agent_knowledge to authenticated;

-- ---------- conversation memory (written by the webhook with the service role) ----------
create table if not exists public.ai_agent_messages (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  chat_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists ai_agent_messages_chat_idx on public.ai_agent_messages (agent_id, chat_id, id desc);
alter table public.ai_agent_messages enable row level security;
create policy "members read" on public.ai_agent_messages for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.ai_agent_messages from anon, authenticated;
grant select on public.ai_agent_messages to authenticated;

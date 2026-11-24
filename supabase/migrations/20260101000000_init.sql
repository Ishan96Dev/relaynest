-- RelayNest initial schema. Every tenant table carries workspace_id and has RLS enabled.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- identity ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text unique not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id, workspace_id);

-- SECURITY DEFINER avoids recursive RLS when policies on other tables check membership.
create or replace function public.is_workspace_member(ws uuid, roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws
      and wm.user_id = (select auth.uid())
      and (roles is null or wm.role = any(roles))
  );
$$;
revoke all on function public.is_workspace_member(uuid, text[]) from public, anon;
grant execute on function public.is_workspace_member(uuid, text[]) to authenticated;

-- Bootstrap profile + personal workspace on signup.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid; base text; nm text;
begin
  nm := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
  insert into public.profiles (id, display_name) values (new.id, nm);
  base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]+', '-', 'g'));
  insert into public.workspaces (name, slug, created_by)
    values (nm || '''s Workspace', base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), new.id)
    returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- bots ----------
create table public.bots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  public_id text unique not null default encode(gen_random_bytes(12), 'hex'),
  name text not null check (char_length(name) between 1 and 50),
  description text,
  category text,
  telegram_bot_id text,
  telegram_username text,
  status text not null default 'draft' check (status in ('draft','active','inactive','error')),
  webhook_status text not null default 'pending',
  webhook_secret_hash text,
  avatar_path text,
  welcome_message text,
  default_response text,
  messages_count bigint not null default 0,
  last_update_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, telegram_bot_id)
);
create index bots_workspace_status_idx on public.bots (workspace_id, status);

-- Never exposed to browser roles: no grants, RLS on with no policies.
create table public.bot_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bot_id uuid unique not null references public.bots(id) on delete cascade,
  encrypted_token text not null,
  encryption_version text not null,
  key_version text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table public.bot_commands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  command text not null check (command ~ '^[a-z0-9_]{1,32}$'),
  description text,
  response_type text not null default 'text',
  response_config jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bot_id, command)
);

create table public.bot_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  match_type text not null check (match_type in ('keyword','default','welcome')),
  match_value text,
  response_text text not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- agents & workflows ----------
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','inactive','error')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  definition jsonb not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflows_ws_agent_status_idx on public.workflows (workspace_id, agent_id, status);

-- Published versions are immutable.
create or replace function public.block_published_edit() returns trigger
language plpgsql as $$
begin
  if old.published_at is not null and new.definition is distinct from old.definition then
    raise exception 'published workflow versions are immutable';
  end if;
  return new;
end $$;
create trigger workflows_immutable before update on public.workflows
  for each row execute function public.block_published_edit();

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  name text not null,
  status text not null default 'disconnected',
  encrypted_config text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid references public.workflows(id) on delete cascade,
  public_id text unique not null default encode(gen_random_bytes(12), 'hex'),
  secret_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.processed_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null,
  external_event_id text not null,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  unique (source, external_event_id)
);

-- ---------- executions ----------
create table public.executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid references public.workflows(id) on delete set null,
  bot_id uuid references public.bots(id) on delete set null,
  workflow_version integer,
  trigger_type text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  idempotency_key text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms bigint,
  error_code text,
  error_message_safe text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index executions_ws_started_idx on public.executions (workspace_id, started_at desc);
create index executions_workflow_status_idx on public.executions (workflow_id, status);
create unique index executions_idem_idx on public.executions (workspace_id, idempotency_key) where idempotency_key is not null;

create table public.execution_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_id uuid not null references public.executions(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  input_summary jsonb,
  output_summary jsonb,
  error_code text,
  error_message_safe text
);
create index execution_steps_exec_idx on public.execution_steps (execution_id);

-- ---------- notifications, activity, templates ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index activity_logs_ws_created_idx on public.activity_logs (workspace_id, created_at desc);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bot','workflow')),
  name text not null,
  description text,
  category text,
  difficulty text,
  definition jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','bots','bot_commands','bot_responses','agents','workflows','integrations','webhook_endpoints','executions']
  loop
    execute format('create trigger %I_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.bots enable row level security;
alter table public.bot_credentials enable row level security;
alter table public.bot_commands enable row level security;
alter table public.bot_responses enable row level security;
alter table public.agents enable row level security;
alter table public.workflows enable row level security;
alter table public.integrations enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.processed_events enable row level security;
alter table public.executions enable row level security;
alter table public.execution_steps enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.templates enable row level security;

-- profiles: own row only
create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces & members
create policy "members read workspace" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "admins update workspace" on public.workspaces for update to authenticated
  using (public.is_workspace_member(id, array['owner','admin'])) with check (public.is_workspace_member(id, array['owner','admin']));
create policy "owner delete workspace" on public.workspaces for delete to authenticated using (public.is_workspace_member(id, array['owner']));
create policy "members read members" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));

-- generic tenant tables: members read, owners/admins write
do $$
declare t text;
begin
  foreach t in array array['bots','bot_commands','bot_responses','agents','workflows','integrations','webhook_endpoints']
  loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id, array[''owner'',''admin'']))', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using (public.is_workspace_member(workspace_id, array[''owner'',''admin''])) with check (public.is_workspace_member(workspace_id, array[''owner'',''admin'']))', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using (public.is_workspace_member(workspace_id, array[''owner'',''admin'']))', t);
  end loop;
end $$;

-- read-only for members; writes happen server-side with the secret key
create policy "members read" on public.executions for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read" on public.execution_steps for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read" on public.activity_logs for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "own notifications read" on public.notifications for select to authenticated
  using (public.is_workspace_member(workspace_id) and (user_id is null or user_id = (select auth.uid())));
create policy "own notifications update" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "templates readable" on public.templates for select to authenticated using (true);
-- processed_events and bot_credentials: no policies = no browser access.

-- ---------- grants ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members, public.executions,
  public.execution_steps, public.activity_logs, public.notifications, public.templates to authenticated;
grant update on public.profiles, public.workspaces to authenticated;
grant delete on public.workspaces to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.bot_commands, public.bot_responses, public.agents, public.workflows to authenticated;

-- Tables with secret columns: column-level SELECT so `select *` is denied and secrets stay server-side.
grant select (id, workspace_id, public_id, name, description, category, telegram_bot_id, telegram_username, status,
  webhook_status, avatar_path, welcome_message, default_response, messages_count, last_update_at, created_by, created_at, updated_at)
  on public.bots to authenticated;
grant insert (workspace_id, name, description, category, welcome_message, default_response, created_by), update (name, description, category, status, welcome_message, default_response, avatar_path)
  on public.bots to authenticated;
grant delete on public.bots to authenticated;

grant select (id, workspace_id, workflow_id, public_id, enabled, created_at, updated_at) on public.webhook_endpoints to authenticated;
grant delete on public.webhook_endpoints to authenticated;
grant select (id, workspace_id, provider, name, status, created_at, updated_at) on public.integrations to authenticated;
grant delete on public.integrations to authenticated;

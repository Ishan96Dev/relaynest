-- Functional Workspace API Keys, API Request Telemetry, and Outbound Integrations metadata.

-- ---------- 1. API Keys ----------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique,
  environment text not null default 'production' check (environment in ('production', 'development')),
  scopes text[] not null default array['bots:read'],
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  request_count bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists api_keys_ws_created_idx
  on public.api_keys (workspace_id, created_at desc);

alter table public.api_keys enable row level security;

drop policy if exists "members read api_keys" on public.api_keys;
create policy "members read api_keys" on public.api_keys
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "admins manage api_keys" on public.api_keys;
create policy "admins manage api_keys" on public.api_keys
  for all to authenticated
  using (public.is_workspace_member(workspace_id, array['owner', 'admin']))
  with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));

revoke all on public.api_keys from anon, authenticated;
grant select (id, workspace_id, name, key_prefix, environment, scopes, status, expires_at, last_used_at, request_count, created_by, created_at, revoked_at)
  on public.api_keys to authenticated;

-- ---------- 2. API Request Logs ----------
create table if not exists public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  method text not null,
  path text not null,
  status_code integer not null,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists api_request_logs_ws_created_idx
  on public.api_request_logs (workspace_id, created_at desc);

alter table public.api_request_logs enable row level security;

drop policy if exists "members read api_request_logs" on public.api_request_logs;
create policy "members read api_request_logs" on public.api_request_logs
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.api_request_logs from anon, authenticated;
grant select on public.api_request_logs to authenticated;

-- Atomic counter update invoked strictly from server service role
create or replace function public.touch_api_key_usage(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_keys
     set last_used_at = now(),
         request_count = request_count + 1
   where id = p_key_id;
end $$;

revoke all on function public.touch_api_key_usage(uuid) from public, anon, authenticated;
grant execute on function public.touch_api_key_usage(uuid) to service_role;

-- ---------- 3. Extend Integrations Metadata ----------
alter table public.integrations
  add column if not exists events text[] not null default array['bot.created','automation.published'],
  add column if not exists target_preview text,
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_status text,
  add column if not exists last_error text;

grant select (id, workspace_id, provider, name, status, events, target_preview, last_tested_at, last_status, last_error, created_at, updated_at)
  on public.integrations to authenticated;

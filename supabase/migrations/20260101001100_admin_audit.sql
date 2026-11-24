-- Platform Admin accounts (no hardcoded credentials) and full User Audit Trail.
-- Both tables have RLS enabled with zero browser grants or policies (server secret key only).

create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  event text not null,
  page_path text,
  detail text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists user_audit_logs_created_idx on public.user_audit_logs (created_at desc);
create index if not exists user_audit_logs_user_idx on public.user_audit_logs (user_id, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.user_audit_logs enable row level security;
revoke all on public.platform_admins, public.user_audit_logs from anon, authenticated;

-- AI Model Catalog, per-user favourites, and AI Agent bots (draft).
-- The catalog is global reference data: any signed-in user can read it, nobody can write it from the browser.

-- ---------- model catalog ----------
create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  name text not null,
  provider_key text not null,
  provider_name text not null,
  source text not null check (source in ('nvidia', 'vercel')),
  source_url text not null,
  api_model_id text not null,
  model_type text not null check (model_type in ('chat', 'multimodal', 'embedding', 'image_generation', 'evaluation')),
  badge text,
  description text not null,
  capabilities text[] not null default '{}',
  params_label text,
  context_tokens bigint check (context_tokens is null or context_tokens > 0),
  max_output_tokens bigint check (max_output_tokens is null or max_output_tokens > 0),
  input_modalities text[] not null default '{Text}',
  output_modalities text[] not null default '{Text}',
  is_free boolean not null default false,
  is_open_source boolean not null default false,
  is_featured boolean not null default false,
  license text,
  deployment text[] not null default '{}',
  released_at date,
  source_updated_at date,
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_models_provider_idx on public.ai_models (provider_key);
create index if not exists ai_models_sort_idx on public.ai_models (sort_order, name);
create trigger ai_models_updated before update on public.ai_models
  for each row execute function public.set_updated_at();

alter table public.ai_models enable row level security;
create policy "models readable" on public.ai_models for select to authenticated using (true);
revoke all on public.ai_models from anon, authenticated;
grant select on public.ai_models to authenticated;

-- ---------- favourites ----------
create table if not exists public.ai_model_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid not null references public.ai_models(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, model_id)
);
alter table public.ai_model_favorites enable row level security;
create policy "own favorites read" on public.ai_model_favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "own favorites insert" on public.ai_model_favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own favorites delete" on public.ai_model_favorites for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_model_favorites from anon, authenticated;
grant select, insert, delete on public.ai_model_favorites to authenticated;

-- ---------- AI agent bots ----------
-- Step 1 ("Basic Information") of the AI Agent Bot wizard. Model execution is not live yet, so rows stay drafts.
create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  username text not null check (username ~ '^[A-Za-z][A-Za-z0-9_]{3,30}[Bb][Oo][Tt]$'),
  description text not null check (char_length(description) between 1 and 300),
  avatar_path text,
  language text not null default 'English' check (char_length(language) between 2 and 40),
  category text not null default 'Community Manager' check (char_length(category) between 2 and 60),
  model_id uuid references public.ai_models(id) on delete set null,
  status text not null default 'draft' check (status in ('draft')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_agents_workspace_username_idx on public.ai_agents (workspace_id, lower(username));
create index if not exists ai_agents_workspace_idx on public.ai_agents (workspace_id, updated_at desc);
create index if not exists ai_agents_model_idx on public.ai_agents (model_id);
create trigger ai_agents_updated before update on public.ai_agents
  for each row execute function public.set_updated_at();

alter table public.ai_agents enable row level security;
create policy "members read" on public.ai_agents for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins insert" on public.ai_agents for insert to authenticated
  with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
create policy "admins update" on public.ai_agents for update to authenticated
  using (public.is_workspace_member(workspace_id, array['owner', 'admin']))
  with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
create policy "admins delete" on public.ai_agents for delete to authenticated
  using (public.is_workspace_member(workspace_id, array['owner', 'admin']));
revoke all on public.ai_agents from anon, authenticated;
grant select, insert, update, delete on public.ai_agents to authenticated;

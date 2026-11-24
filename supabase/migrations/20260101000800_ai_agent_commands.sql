-- AI agent slash commands (chat, image generation, image description) and an optional image model.
alter table public.ai_agents
  add column if not exists image_model_id uuid references public.ai_models(id) on delete set null,
  add column if not exists commands jsonb not null default '[]'::jsonb check (jsonb_typeof(commands) = 'array' and pg_column_size(commands) < 16384);

create index if not exists ai_agents_image_model_idx on public.ai_agents (image_model_id);

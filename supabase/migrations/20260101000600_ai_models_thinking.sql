-- Thinking (reasoning) models and the sampling defaults that suit each model.
alter table public.ai_models
  add column if not exists is_thinking boolean not null default false,
  add column if not exists default_temperature numeric(3, 2) not null default 0.5 check (default_temperature between 0 and 1),
  add column if not exists default_max_tokens integer not null default 1024 check (default_max_tokens between 16 and 4096);

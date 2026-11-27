-- Detailed execution journey tracing, AI usage linkage, and atomic bot message counters.

-- 1. Enrich execution_steps with explicit ordering and step-level duration.
alter table public.execution_steps
  add column if not exists step_order integer not null default 0,
  add column if not exists duration_ms integer;

create index if not exists execution_steps_exec_order_idx
  on public.execution_steps (execution_id, step_order, started_at);

-- 2. Link AI usage telemetry directly to bots and executions for per-command attribution.
alter table public.ai_usage_events
  add column if not exists bot_id uuid references public.bots(id) on delete set null,
  add column if not exists execution_id uuid references public.executions(id) on delete set null;

create index if not exists ai_usage_events_exec_idx
  on public.ai_usage_events (execution_id)
  where execution_id is not null;

create index if not exists ai_usage_events_bot_created_idx
  on public.ai_usage_events (bot_id, created_at desc)
  where bot_id is not null;

-- 3. Speed up per-bot execution analytics queries.
create index if not exists executions_bot_started_idx
  on public.executions (bot_id, started_at desc)
  where bot_id is not null;

-- 4. Atomic bot message & activity counter used by server-side webhook/agent runtimes.
create or replace function public.increment_bot_messages(p_bot_id uuid, p_delta integer default 1)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bots
  set
    messages_count = messages_count + greatest(coalesce(p_delta, 1), 0),
    last_update_at = now()
  where id = p_bot_id;
$$;

revoke all on function public.increment_bot_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_bot_messages(uuid, integer) to service_role;

-- 5. Backfill bots.messages_count from recorded bot executions where counters stayed at 0.
update public.bots b
set messages_count = greatest(
  b.messages_count,
  (select count(*)::bigint from public.executions e where e.bot_id = b.id)
)
where exists (select 1 from public.executions e where e.bot_id = b.id);

-- 6. Repair legacy execution rows where started_at defaulted to insert time (after finished_at).
update public.executions
set started_at = finished_at - ((duration_ms::double precision / 1000.0) * interval '1 second')
where finished_at is not null
  and duration_ms is not null
  and duration_ms > 0
  and started_at > finished_at;

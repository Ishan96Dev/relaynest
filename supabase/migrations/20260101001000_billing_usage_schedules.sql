-- Billing (Razorpay), AI usage metering, and automation schedules.
-- Browser roles can only read these tables (RLS); every write happens server-side with the secret key.

-- ---------- billing ----------
create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','business')),
  status text not null default 'active' check (status in ('created','active','pending','halted','cancelled','completed','expired')),
  -- 'recurring' renews automatically (Razorpay Subscriptions); 'one_time' is a prepaid period (Razorpay Orders).
  mode text not null default 'recurring' check (mode in ('recurring','one_time')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  currency text not null default 'USD' check (currency in ('USD','INR')),
  razorpay_subscription_id text unique,
  razorpay_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Razorpay plan IDs are created on demand (one per plan, cycle and currency) and cached here.
create table public.razorpay_plans (
  key text primary key,
  razorpay_plan_id text not null,
  amount bigint not null,
  currency text not null,
  created_at timestamptz not null default now()
);

create sequence public.invoice_number_seq start 1;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  razorpay_payment_id text unique not null,
  razorpay_order_id text,
  razorpay_subscription_id text,
  plan text not null,
  billing_cycle text not null,
  mode text not null,
  -- Minor units: cents for USD, paise for INR.
  amount bigint not null,
  currency text not null,
  status text not null check (status in ('authorized','captured','failed','refunded')),
  method text,
  card_network text,
  card_last4 text,
  error_description text,
  created_at timestamptz not null default now()
);
create index payments_ws_created_idx on public.payments (workspace_id, created_at desc);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payment_id uuid unique references public.payments(id) on delete set null,
  number text unique not null default ('RN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0')),
  plan text not null,
  description text not null,
  amount bigint not null,
  currency text not null,
  status text not null default 'paid' check (status in ('paid','refunded','void')),
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz not null default now()
);
create index invoices_ws_issued_idx on public.invoices (workspace_id, issued_at desc);

-- Webhook idempotency: Razorpay retries deliveries, and the same event id must be processed once.
create table public.billing_events (
  event_id text primary key,
  event text not null,
  received_at timestamptz not null default now()
);

-- ---------- AI usage metering ----------
create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('nvidia','vercel')),
  model_slug text not null,
  api_model_id text,
  kind text not null check (kind in ('chat','embedding','image','decision','vision')),
  origin text not null default 'api' check (origin in ('playground','agent','knowledge','api')),
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  -- USD. Vercel reports or implies a price; NVIDIA Build is a free trial tier, so its cost is 0 unless prices are configured.
  cost_usd numeric(14,8) not null default 0,
  latency_ms integer,
  provider_request_id text,
  created_at timestamptz not null default now()
);
create index ai_usage_ws_created_idx on public.ai_usage_events (workspace_id, created_at desc);

-- ---------- automations ----------
-- One row per published workflow with a schedule trigger. The tick endpoint runs rows whose next_run_at has passed.
create table public.workflow_schedules (
  workflow_id uuid primary key references public.workflows(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cron text not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  updated_at timestamptz not null default now()
);
create index workflow_schedules_due_idx on public.workflow_schedules (next_run_at) where enabled;
create trigger workflow_schedules_updated before update on public.workflow_schedules
  for each row execute function public.set_updated_at();

-- Workflows are edited in place and versioned on publish, so the old "published is immutable" guard goes away.
drop trigger if exists workflows_immutable on public.workflows;

alter table public.workflows add column if not exists description text;
alter table public.executions add column if not exists trigger_payload jsonb;

-- ---------- RLS and grants ----------
alter table public.subscriptions enable row level security;
alter table public.razorpay_plans enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.workflow_schedules enable row level security;

create policy "members read" on public.subscriptions for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins read" on public.payments for select to authenticated using (public.is_workspace_member(workspace_id, array['owner','admin']));
create policy "admins read" on public.invoices for select to authenticated using (public.is_workspace_member(workspace_id, array['owner','admin']));
create policy "members read" on public.ai_usage_events for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read" on public.workflow_schedules for select to authenticated using (public.is_workspace_member(workspace_id));
-- razorpay_plans and billing_events: no policies = no browser access.

grant select on public.subscriptions, public.payments, public.invoices, public.ai_usage_events, public.workflow_schedules to authenticated;

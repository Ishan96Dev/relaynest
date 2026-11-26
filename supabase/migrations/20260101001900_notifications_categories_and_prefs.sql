-- Expand notifications with categories, action links, metadata, user-owned delete RLS,
-- and backfill new in-app & email preference keys in public.user_settings.

-- 1. Enrich public.notifications for categorized in-app delivery, deep links, and dismissal.
alter table public.notifications
  add column if not exists category text not null default 'system',
  add column if not exists action_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check check (
    category in (
      'login',
      'security',
      'apiKeys',
      'botActivity',
      'aiAgents',
      'knowledgeBase',
      'automationEvents',
      'executionFailures',
      'integrations',
      'billing',
      'workspace',
      'system'
    )
  );

create index if not exists notifications_ws_user_created_idx
  on public.notifications (workspace_id, user_id, created_at desc);

create index if not exists notifications_user_category_created_idx
  on public.notifications (user_id, category, created_at desc);

-- Allow authenticated users to dismiss / clear their own notifications.
drop policy if exists "own notifications delete" on public.notifications;
create policy "own notifications delete" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

grant delete on public.notifications to authenticated;

-- 2. Backfill category and action_url for existing notifications.
update public.notifications
set
  category = case
    when kind = 'login_detected' then 'login'
    when kind in ('password_changed', 'sessions_revoked') then 'security'
    when kind like 'api_key_%' or kind = 'bot_token_updated' then 'apiKeys'
    when kind in ('execution_failed', 'integration_failed', 'agent_execution_failed') then 'executionFailures'
    when kind like 'integration_%' or kind like 'webhook_%' then 'integrations'
    when kind like 'bot_%' then 'botActivity'
    when kind like 'agent_%' then 'aiAgents'
    when kind like 'kb_%' then 'knowledgeBase'
    when kind like 'automation_%' then 'automationEvents'
    when kind like 'payment_%' or kind like 'plan_%' or kind like 'subscription_%' then 'billing'
    when kind in ('workspace_updated', 'member_invited', 'profile_updated') then 'workspace'
    else 'system'
  end,
  action_url = coalesce(
    action_url,
    case
      when kind in ('login_detected', 'password_changed', 'sessions_revoked') then '/settings/security'
      when kind like 'api_key_%' then '/settings/api-keys'
      when kind = 'bot_token_updated' or kind like 'bot_%' then '/bots'
      when kind in ('execution_failed', 'agent_execution_failed') then '/executions'
      when kind like 'integration_%' or kind like 'webhook_%' then '/integrations'
      when kind like 'agent_%' then '/ai'
      when kind like 'kb_%' then '/knowledge-base'
      when kind like 'automation_%' then '/agents'
      when kind like 'payment_%' or kind like 'plan_%' or kind like 'subscription_%' then '/settings/billing'
      when kind in ('workspace_updated', 'member_invited') then '/settings/workspace'
      when kind = 'profile_updated' then '/settings/profile'
      else '/settings/notifications'
    end
  );

-- 3. Backfill new notification preference keys on existing user_settings rows without clobbering user choices.
update public.user_settings
set value = jsonb_set(
  jsonb_set(
    value,
    '{inapp}',
    jsonb_build_object(
      'login', coalesce((value->'email'->>'login')::boolean, false),
      'security', true,
      'apiKeys', true,
      'botActivity', true,
      'aiAgents', true,
      'knowledgeBase', true,
      'automationEvents', true,
      'executionFailures', true,
      'integrations', true,
      'billing', true,
      'workspace', true,
      'system', true
    ) || coalesce(value->'inapp', '{}'::jsonb),
    true
  ),
  '{email}',
  jsonb_build_object(
    'accountSecurity', true,
    'login', false,
    'apiKeys', coalesce((value->'email'->>'accountSecurity')::boolean, true),
    'invites', true,
    'botConnected', true,
    'botOffline', true,
    'automationFailures', true,
    'workflowStatus', true,
    'billing', true,
    'product', true,
    'features', true,
    'marketing', false
  ) || coalesce(value->'email', '{}'::jsonb),
  true
)
where key = 'notifications';

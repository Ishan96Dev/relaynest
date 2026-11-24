# Database Schema and Supabase Security

## 1. Principles

- PostgreSQL is the source of truth for application data.
- Every tenant-owned row is associated with a workspace.
- Every exposed table has RLS enabled.
- Application authorization verifies workspace membership.
- Never authorize using user-editable `user_metadata`.
- Credentials are encrypted before persistence.
- Use migrations as the schema source of truth.

## 2. Suggested entities

  Table                 Purpose
  --------------------- --------------------------------------------
  `profiles`            Application profile linked to `auth.users`
  `workspaces`          Tenant/workspace
  `workspace_members`   Membership and role
  `bots`                Telegram bot configuration
  `bot_credentials`     Encrypted bot token and key metadata
  `bot_commands`        Bot commands
  `bot_responses`       Predefined response rules
  `agents`              Automation agent metadata
  `workflows`           Versioned workflow graph
  `integrations`        External service connections
  `webhook_endpoints`   Workspace webhook configuration
  `processed_events`    Deduplication/idempotency records
  `executions`          Workflow execution
  `execution_steps`     Per-node execution result
  `notifications`       In-app notifications
  `activity_logs`       User-visible activity events
  `templates`           Curated bot and workflow templates

## 3. Relationship model

``` text
auth.users
  └── profiles

workspaces
  ├── workspace_members
  ├── bots
  │    ├── bot_credentials
  │    ├── bot_commands
  │    └── bot_responses
  ├── agents
  │    └── workflows
  │         ├── executions
  │         └── execution_steps
  ├── integrations
  ├── webhook_endpoints
  ├── processed_events
  ├── notifications
  └── activity_logs
```

## 4. Suggested column design

### profiles

- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text`
- `avatar_path text`
- `created_at timestamptz`
- `updated_at timestamptz`

### workspaces

- `id uuid primary key`
- `name text not null`
- `slug text unique`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz`
- `updated_at timestamptz`

### workspace_members

- `workspace_id uuid references workspaces(id) on delete cascade`
- `user_id uuid references auth.users(id) on delete cascade`
- `role text check (role in ('owner','admin','member','viewer'))`
- `created_at timestamptz`
- Primary key: `(workspace_id, user_id)`

### bots

- `id uuid primary key`
- `workspace_id uuid not null references workspaces(id)`
- `name text not null`
- `description text`
- `telegram_bot_id text`
- `telegram_username text`
- `status text check (status in ('draft','active','inactive','error'))`
- `webhook_status text`
- `avatar_path text`
- `last_update_at timestamptz`
- `created_by uuid references auth.users(id)`
- timestamps

Do not store the raw Telegram token in this table.

### bot_credentials

- `id uuid primary key`
- `workspace_id uuid not null`
- `bot_id uuid unique not null references bots(id) on delete cascade`
- `encrypted_token text not null`
- `encryption_version text not null`
- `key_version text not null`
- `created_at timestamptz`
- `rotated_at timestamptz`

Never expose this table to ordinary browser access. Prefer server-only
access and restrictive grants/RLS.

### bot_commands

- `id uuid primary key`
- `workspace_id uuid not null`
- `bot_id uuid not null references bots(id) on delete cascade`
- `command text not null`
- `description text`
- `response_type text`
- `response_config jsonb`
- `enabled boolean default true`
- timestamps

### bot_responses

- `id uuid primary key`
- `workspace_id uuid not null`
- `bot_id uuid not null references bots(id) on delete cascade`
- `match_type text check (match_type in ('keyword','default','welcome'))`
- `match_value text`
- `response_text text not null`
- `priority integer default 100`
- `enabled boolean default true`
- timestamps

### agents

- `id uuid primary key`
- `workspace_id uuid not null`
- `name text not null`
- `description text`
- `status text check (status in ('draft','active','inactive','error'))`
- `created_by uuid`
- timestamps

### workflows

- `id uuid primary key`
- `workspace_id uuid not null`
- `agent_id uuid not null references agents(id) on delete cascade`
- `name text not null`
- `version integer not null default 1`
- `definition jsonb not null`
- `status text check (status in ('draft','active','archived'))`
- `published_at timestamptz`
- timestamps

Store a complete immutable published version or otherwise guarantee that
an execution uses a stable workflow snapshot. Do not allow editing a
published version to mutate an already-running execution.

### integrations

- `id uuid primary key`
- `workspace_id uuid not null`
- `provider text not null`
- `name text not null`
- `status text`
- `encrypted_config jsonb`
- timestamps

Sensitive fields in `encrypted_config` must be encrypted; do not store
provider secrets as plaintext JSON.

### webhook_endpoints

- `id uuid primary key`
- `workspace_id uuid not null`
- `workflow_id uuid references workflows(id)`
- `public_id text unique not null`
- `secret_hash text not null`
- `enabled boolean default true`
- timestamps

Store a hash of webhook secrets when verification only requires
comparison. Do not store plaintext webhook secrets unnecessarily.

### processed_events

- `id uuid primary key`
- `workspace_id uuid not null`
- `source text not null`
- `external_event_id text not null`
- `received_at timestamptz`
- `status text`
- Unique constraint: `(source, external_event_id)`

### executions

- `id uuid primary key`
- `workspace_id uuid not null`
- `workflow_id uuid not null`
- `workflow_version integer not null`
- `trigger_type text not null`
- `status text check (status in ('queued','running','succeeded','failed','cancelled'))`
- `idempotency_key text`
- `started_at timestamptz`
- `finished_at timestamptz`
- `duration_ms bigint`
- `error_code text`
- `error_message_safe text`
- timestamps

### execution_steps

- `id uuid primary key`
- `workspace_id uuid not null`
- `execution_id uuid not null references executions(id) on delete cascade`
- `node_id text not null`
- `node_type text not null`
- `status text`
- `started_at timestamptz`
- `finished_at timestamptz`
- `input_summary jsonb`
- `output_summary jsonb`
- `error_code text`
- `error_message_safe text`

Do not persist raw secrets or unnecessary private message contents in
execution logs.

## 5. RLS strategy

Enable RLS on every table in exposed schemas.

For workspace-owned data, policies should check membership using
`auth.uid()` and `workspace_members`. Use role-aware policies for write
operations.

Example read policy:

``` sql
create policy "workspace members can read bots"
on public.bots
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = bots.workspace_id
      and wm.user_id = (select auth.uid())
  )
);
```

Example update policy:

``` sql
create policy "workspace admins can update bots"
on public.bots
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = bots.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = bots.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
);
```

Create corresponding INSERT and DELETE policies. An UPDATE policy needs
both `USING` and `WITH CHECK`. A role check alone is not enough; include
tenant ownership.

## 6. Credential isolation

Recommended: - Keep bot credentials in a restricted table or private
schema. - Use server-side privileged access only for credential
operations. - Encrypt tokens with authenticated encryption such as
AES-256-GCM. - Keep encryption key in Cloudflare Worker Secret. - Store
key version and encryption format version. - Plan key rotation and
re-encryption. - Mask credentials in UI. - Never return decrypted
credentials from an API.

Do not use the Supabase service/secret key in the browser.

## 7. Indexes

Add indexes for: - `workspace_members(user_id, workspace_id)` -
`bots(workspace_id, status)` - `agents(workspace_id, status)` -
`workflows(workspace_id, agent_id, status)` -
`executions(workspace_id, started_at desc)` -
`executions(workflow_id, status)` - `execution_steps(execution_id)` -
`processed_events(source, external_event_id)` unique -
`activity_logs(workspace_id, created_at desc)`

## 8. Migrations and validation

- Create migrations with the Supabase CLI workflow.
- Keep migration SQL in source control.
- Test RLS using at least two users in separate workspaces.
- Verify that one tenant cannot read, update, or delete another tenant's
  records.
- Run Supabase database advisors before production.
- Confirm Data API grants and exposure settings.

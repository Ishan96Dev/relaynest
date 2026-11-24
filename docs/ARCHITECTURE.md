# System Architecture

## 1. Architecture summary

RelayNest is a multi-tenant web application. The MVP uses Next.js for
the web UI and application API, Supabase for identity and persistence,
Telegram as the first messaging channel, and Cloudflare Workers for
hosting.

### Logical architecture

``` text
Browser
  |
  v
Cloudflare edge / Next.js Worker
  |-- Marketing pages
  |-- Authenticated dashboard
  |-- Server actions / Route Handlers
  |-- Telegram webhook endpoints
  |-- Workflow API
  |
  +------ Supabase Auth
  +------ Supabase PostgreSQL
  +------ Supabase Storage
  |
  +------ Telegram Bot API
  |
  +------ Durable execution infrastructure (when needed)
```

## 2. Deployment recommendation

Prefer one Next.js application deployed to Cloudflare Workers for the
first release. Use the current Cloudflare-supported Next.js deployment
route and validate runtime compatibility.

Cloudflare Pages is suitable for static sites, but a full Next.js app
with server rendering and route handlers needs a compatible server
runtime. Do not assume a conventional Node.js server can be deployed
unchanged to Workers.

## 3. Application layers

### Presentation layer

- Marketing pages.
- Authentication pages.
- Dashboard shell.
- Bot management.
- Agent/workflow editor.
- Execution history.
- Settings.

### Application layer

- Auth/session verification.
- Workspace membership checks.
- Input validation.
- Use-case orchestration.
- API response mapping.

### Domain layer

- Bot lifecycle.
- Telegram bot configuration.
- Agent and workflow definitions.
- Workflow validation.
- Workflow execution semantics.
- Execution state transitions.

### Infrastructure layer

- Supabase repositories.
- Telegram API client.
- Secret encryption.
- Webhook verification.
- Durable queues/schedules.
- Logging and telemetry.

## 4. Core domain interfaces

Keep integrations behind interfaces.

``` ts
export interface MessageOutputAdapter {
  sendText(input: {
    destination: string;
    text: string;
    idempotencyKey?: string;
  }): Promise<{ externalMessageId?: string }>;
}

export interface TriggerEvent {
  type: string;
  workspaceId: string;
  source: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface WorkflowExecutor {
  execute(input: {
    workflowId: string;
    version: number;
    event: TriggerEvent;
    idempotencyKey: string;
  }): Promise<{ executionId: string; status: string }>;
}
```

Do not couple the workflow engine directly to Telegram-specific
payloads.

## 5. Request flows

### Web application request

1.  Browser sends request to Next.js.
2.  Server validates session.
3.  Server resolves workspace membership.
4.  Request schema is validated.
5.  Domain service performs operation.
6.  Repository accesses Supabase.
7.  Response is mapped to a safe DTO.

### Telegram webhook

1.  Telegram sends HTTPS POST.
2.  Handler validates `X-Telegram-Bot-Api-Secret-Token`.
3.  Handler resolves bot using the webhook route identifier.
4.  Handler checks duplicate update ID.
5.  Handler persists/queues the event.
6.  Handler responds promptly.
7.  Processor evaluates configured commands/rules or starts a workflow.
8.  Telegram adapter sends response.
9.  Execution outcome is recorded.

### Workflow event

1.  Trigger creates normalized event.
2.  Workflow version is loaded.
3.  Graph and node configuration are validated.
4.  Nodes execute in deterministic order.
5.  Conditions determine outgoing path.
6.  Actions execute with bounded timeouts.
7.  Step and execution statuses are persisted.

## 6. Reliability model

Do not promise exactly-once delivery. External APIs and webhook retries
can produce at-least-once behaviour.

Implement: - Deduplication keys for incoming Telegram updates. - Unique
constraints on provider/event identifiers where appropriate. -
Idempotency records for side-effecting actions. - Bounded retries with
exponential backoff and jitter. - Dead-letter or failed-execution state
for exhausted retries. - Timeouts for network actions. - Execution
limits and concurrency controls.

## 7. Durable execution

Do not rely on in-memory timers or background promises that may be
terminated after a Worker response.

Use a durable mechanism for: - Scheduled triggers. - Delayed retries. -
Long-running workflows. - High-volume webhook processing.

Evaluate Cloudflare Queues, Workflows, and Cron Triggers against the
exact workload and current platform limits. Keep a provider abstraction
where practical.

## 8. Storage responsibilities

  -----------------------------------------------------------------------
  Data                                Store
  ----------------------------------- -----------------------------------
  Users and identity                  Supabase Auth

  Profiles/workspaces                 Supabase PostgreSQL

  Bot and workflow definitions        Supabase PostgreSQL

  Encrypted Telegram credentials      Supabase PostgreSQL

  Uploaded avatars/assets             Supabase Storage

  Execution records                   Supabase PostgreSQL initially

  Large/high-volume telemetry         Consider a dedicated log/analytics
                                      store later

  Embeddings and vector records       Milvus in a future release
  -----------------------------------------------------------------------

## 9. Future AI architecture

Future only; not implemented in MVP:

``` text
Agent runtime
  |
AI provider gateway
  |-- OpenAI
  |-- Google Gemini
  |-- Anthropic
  |-- Local Ollama
  |
Knowledge retrieval
  |-- Document processing
  |-- Embedding provider
  |-- Milvus
```

Cloudflare AI Gateway may be added as an observability/routing layer. Do
not assume it replaces provider-specific authentication or application
authorization.

## 10. Scalability boundaries

Keep these independently scalable: - Web application. - Webhook
ingress. - Workflow execution. - Scheduled triggers. - External
integration adapters.

For MVP they may share one deployment, but use separate modules and
contracts.

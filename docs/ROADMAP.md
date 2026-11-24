# Product Roadmap

## Phase 0 --- Foundation

- Product branding and design tokens.
- Repository and CI setup.
- Next.js app shell.
- Cloudflare runtime compatibility.
- Supabase project and migrations.
- Authentication and workspace bootstrap.

## Phase 1 --- Dashboard and bot management

- Landing page.
- Signup/login/password reset.
- Protected dashboard.
- Workspace and profile settings.
- Bot CRUD.
- BotFather token validation.
- Encrypted credential storage.
- Telegram webhook registration.

## Phase 2 --- Telegram bot functionality

- `/start` and `/help`.
- Custom commands.
- Keyword and default responses.
- Welcome and support templates.
- Bot status and basic activity.
- Webhook deduplication.

## Phase 3 --- Agent and workflow automation

- Agent CRUD.
- React Flow editor.
- Trigger, condition, and action node library.
- Workflow schema and validation.
- Publish/version workflow.
- Telegram output action.
- HTTP webhook trigger.
- Schedule trigger using durable platform scheduling.

## Phase 4 --- Monitoring and hardening

- Execution history.
- Step-level execution details.
- Retry controls.
- Basic analytics.
- Rate limits and quotas.
- Abuse controls.
- Audit logs.
- Production observability.

## Phase 5 --- Additional integrations

Potential channels and providers: - Discord. - Slack. - Email. -
WhatsApp, subject to provider and policy requirements. - GitHub. - CI/CD
providers. - Monitoring platforms.

## Phase 6 --- AI platform (future)

All items below are Coming Soon and excluded from MVP: - AI Agent
Builder. - Provider API key management. - OpenAI, Gemini, and Anthropic
models. - Local Ollama connections. - Cloudflare AI Gateway. - Knowledge
Base uploads. - Chunking and embedding pipeline. - Milvus vector
search. - RAG-powered Telegram responses.

## Release gates

Do not move to a later phase until: - Current phase acceptance criteria
pass. - Security checks pass. - Operational limits are understood. -
Documentation is updated.

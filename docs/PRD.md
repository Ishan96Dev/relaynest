# Product Requirements Document (PRD)

## 1. Document control

  Field              Value
  ------------------ --------------------------------
  Product            RelayNest
  Version            1.0
  Status             Draft for implementation
  Repository         `relaynest`
  Primary platform   Responsive web application
  Initial channel    Telegram
  AI capability      Coming Soon; excluded from MVP

## 2. Product vision

RelayNest enables individuals and teams to create Telegram bots and
deterministic automation workflows from a single workspace, without
needing to build and host custom bot infrastructure.

**Tagline:** Build Bots. Automate Tasks. Connect Everything.

## 3. Problem statement

Users and small teams often need simple Telegram automation---welcome
messages, FAQs, reminders, alerts, lead capture, GitHub notifications,
and monitoring---but must otherwise combine bot scripts, hosting,
webhook configuration, databases, and monitoring tools.

RelayNest centralizes bot setup, workflow configuration, Telegram
connectivity, execution history, and basic analytics in one product.

## 4. Goals

### MVP goals

- Allow a user to register, sign in, recover access, and manage a
  workspace.
- Allow a user to connect a Telegram bot using a BotFather token.
- Validate the token and retrieve bot identity.
- Configure commands and predefined responses.
- Receive Telegram updates through a secure webhook.
- Execute supported deterministic rules and actions.
- Provide a visual workflow builder for trigger-condition-action flows.
- Send workflow outputs to Telegram.
- Record execution status and useful logs.
- Provide bot and workflow status, basic metrics, and operational
  controls.
- Deploy the web application and backend endpoints on Cloudflare
  infrastructure.

### Non-goals for MVP

- LLM-based chat or reasoning.
- AI agent planning or autonomous tool use.
- RAG, document embeddings, or semantic search.
- Milvus-backed production knowledge bases.
- Cloudflare AI Gateway integration.
- WhatsApp, Discord, Slack, or other channels.
- Arbitrary user-authored JavaScript, Python, shell, or SQL execution.
- Complex billing and subscription enforcement.
- Guaranteed exactly-once execution across external systems.

## 5. Target users and personas

### Persona A: Solo creator

Needs a welcome bot, FAQ, reminders, and announcements with minimal
configuration.

### Persona B: Developer

Needs GitHub, CI/CD, API, and server monitoring notifications delivered
to Telegram.

### Persona C: Small business operator

Needs lead capture, appointment requests, order intake, and customer
support routing.

### Persona D: Community administrator

Needs group welcome flows, predefined moderation rules, polls, and admin
notifications.

## 6. Core terminology

- **Bot:** A Telegram bot identity connected by a BotFather token and
  configured in RelayNest.
- **Agent:** A named automation definition that owns a workflow.
- **Workflow:** A deterministic graph of triggers, conditions, and
  actions.
- **Trigger:** An event that starts a workflow.
- **Condition:** A rule that evaluates event data.
- **Action:** A supported operation performed by a workflow.
- **Execution:** One attempt to process a workflow run.
- **Workspace:** A tenant boundary containing users, bots, agents,
  integrations, and logs.
- **Integration:** A configured external service connection.

## 7. MVP use cases

### Telegram bot templates

  -----------------------------------------------------------------------
  Template                Trigger                 Behaviour
  ----------------------- ----------------------- -----------------------
  Welcome Bot             New member / `/start`   Sends configured
                                                  welcome text

  FAQ Bot                 Command or keyword      Returns a predefined
                                                  answer

  Auto Reply Bot          Matching message        Sends configured
                                                  response

  Support Intake Bot      `/support`              Collects a request and
                                                  notifies an admin

  Feedback Bot            `/feedback`             Collects structured
                                                  feedback

  Announcement Bot        Admin action / schedule Sends an announcement

  Reminder Bot            Schedule                Sends a reminder

  Lead Capture Bot        `/start` or menu        Collects configured
                          selection               fields

  GitHub Notification Bot GitHub webhook          Sends event summary to
                                                  Telegram

  Monitoring Alert Bot    Scheduled HTTP check /  Sends configured alert
                          webhook                 
  -----------------------------------------------------------------------

### Agent templates

  -----------------------------------------------------------------------
  Agent                   Trigger                 Example actions
  ----------------------- ----------------------- -----------------------
  GitHub Agent            GitHub webhook          Filter event, send
                                                  Telegram message

  Deployment Agent        CI/CD webhook           Format deployment
                                                  result, notify channel

  Website Monitor         Schedule                HTTP request, evaluate
                                                  status, notify

  API Monitor             Schedule or webhook     Check response, notify
                                                  on failure

  Daily Summary           Schedule                Send static/configured
                                                  summary

  Lead Routing            Form/webhook event      Store lead, notify
                                                  Telegram

  Keyword Monitor         Telegram message        Match keyword, notify
                                                  admin

  Reminder Agent          Schedule                Send Telegram reminder
  -----------------------------------------------------------------------

## 8. Functional requirements

Priority definitions: **P0** required for MVP; **P1** desirable for MVP;
**P2** later.

### Authentication and workspace

- FR-AUTH-01 (P0): Users can sign up with email and password.
- FR-AUTH-02 (P0): Users can sign in and sign out.
- FR-AUTH-03 (P0): Users can request password reset.
- FR-AUTH-04 (P0): Protected application routes require a valid
  authenticated session.
- FR-AUTH-05 (P0): A new user receives a default workspace.
- FR-AUTH-06 (P0): All tenant-owned records are scoped to a workspace.
- FR-AUTH-07 (P1): Workspace owners can invite members and assign roles.

### Dashboard

- FR-DASH-01 (P0): Show total bots, active bots, agents, executions, and
  failed executions.
- FR-DASH-02 (P0): Show recent activity and recent executions.
- FR-DASH-03 (P0): Provide quick actions to create a bot or agent.
- FR-DASH-04 (P1): Show message and execution trends.

### Bot management

- FR-BOT-01 (P0): Create, view, edit, activate, deactivate, and delete a
  bot.
- FR-BOT-02 (P0): Store Telegram credentials encrypted server-side.
- FR-BOT-03 (P0): Validate a token through Telegram `getMe`.
- FR-BOT-04 (P0): Register and remove a webhook.
- FR-BOT-05 (P0): Configure `/start`, `/help`, and custom commands.
- FR-BOT-06 (P0): Configure welcome, default, keyword, and error
  responses.
- FR-BOT-07 (P0): Display connection and webhook status.
- FR-BOT-08 (P0): Prevent a bot token from being returned in API
  responses.
- FR-BOT-09 (P1): Provide searchable bot templates.
- FR-BOT-10 (P1): Support bot avatar upload through Supabase Storage.

### Workflow and agent management

- FR-WF-01 (P0): Create, edit, duplicate, activate, deactivate, and
  delete agents.
- FR-WF-02 (P0): Create workflows using supported trigger, condition,
  and action nodes.
- FR-WF-03 (P0): Connect nodes visually and persist graph structure.
- FR-WF-04 (P0): Validate graph structure before activation.
- FR-WF-05 (P0): Support Telegram message, webhook, and schedule
  triggers.
- FR-WF-06 (P0): Support text/field conditions and HTTP status
  conditions.
- FR-WF-07 (P0): Support Telegram send-message and HTTP request actions.
- FR-WF-08 (P0): Record execution status, timing, and safe diagnostic
  logs.
- FR-WF-09 (P1): Retry eligible failed executions.
- FR-WF-10 (P1): Provide workflow templates.

### Integrations

- FR-INT-01 (P0): Connect Telegram bots.
- FR-INT-02 (P0): Accept authenticated incoming webhooks for supported
  workflows.
- FR-INT-03 (P1): Provide GitHub webhook setup documentation and sample
  payloads.
- FR-INT-04 (P2): Add additional messaging channels through adapters.

### Monitoring

- FR-MON-01 (P0): List executions with status, workflow, start time, and
  duration.
- FR-MON-02 (P0): Show execution details and step-level results.
- FR-MON-03 (P0): Record bot connection state and last update time.
- FR-MON-04 (P1): Provide date and status filters.
- FR-MON-05 (P1): Provide basic success/failure analytics.

### Coming Soon features

Show disabled cards with a clear Coming Soon label: - AI Agent
Builder. - LLM provider management. - AI model selection. - Knowledge
Base and RAG. - Milvus vector search. - Cloudflare AI Gateway. - Local
Ollama model connections.

These cards must not imply that the functionality is available.

## 9. Non-functional requirements

- NFR-01 Security: All tenant-owned records require workspace
  authorization.
- NFR-02 Security: RLS enabled on exposed Supabase tables.
- NFR-03 Security: Secrets encrypted at rest by the application before
  database storage where appropriate.
- NFR-04 Security: No credentials in frontend bundles, logs, analytics,
  or error messages.
- NFR-05 Reliability: Webhook handlers acknowledge valid requests
  promptly and avoid lengthy synchronous work.
- NFR-06 Reliability: Duplicate Telegram updates and webhook retries are
  handled idempotently.
- NFR-07 Reliability: Workflow actions have timeouts and bounded
  retries.
- NFR-08 Maintainability: Integrations and actions use adapter
  interfaces.
- NFR-09 Accessibility: Keyboard-operable controls, visible focus,
  semantic labels, and sufficient contrast.
- NFR-10 Performance: Paginate execution history and other potentially
  large lists.
- NFR-11 Observability: Structured logs include request and execution
  identifiers without secret values.
- NFR-12 Portability: Core business logic should not depend directly on
  Cloudflare-specific APIs where avoidable.

## 10. User journeys

### First-time user

1.  Open landing page.
2.  Select Get Started.
3.  Sign up and verify email if required.
4.  Create or enter default workspace.
5.  View onboarding checklist.
6.  Create first bot or explore templates.

### Create Telegram bot

1.  Select Bots → Create Bot.
2.  Choose blank bot or template.
3.  Enter name, description, and category.
4.  Paste BotFather token.
5.  Backend validates token with Telegram `getMe`.
6.  User configures commands and responses.
7.  User publishes.
8.  Backend registers webhook.
9.  User tests the bot in Telegram.
10. Dashboard displays connection state and activity.

### Create automation agent

1.  Select Agents → Create Agent.
2.  Name the agent.
3.  Choose a trigger.
4.  Add optional conditions.
5.  Add one or more actions.
6.  Connect nodes.
7.  Configure Telegram output.
8.  Validate and test.
9.  Activate workflow.
10. Review execution history.

## 11. Success metrics

MVP instrumentation should measure: - Sign-up completion rate. - First
bot created. - First Telegram bot successfully connected. - First
successful message handled. - First workflow activated. - Workflow
success rate. - Failed execution rate. - Weekly active workspaces. -
Bots active per workspace.

Do not collect message contents for product analytics unless necessary
and clearly disclosed.

## 12. Acceptance criteria

The MVP is acceptable when: - A user can sign up, sign in, and access
only authorized workspace data. - A user can connect a valid Telegram
bot token and see bot identity. - A bot can receive Telegram updates
through a verified webhook. - A configured `/start` response is
delivered. - A workflow can be created, validated, activated, and
executed. - Telegram output actions work for authorized bots. -
Duplicate incoming updates do not create duplicate side effects where
idempotency can be enforced. - Execution records are visible to
authorized workspace members. - Secrets are never exposed to the
browser. - Production deployment and environment configuration are
documented. - AI features are visibly marked Coming Soon and are
non-functional.

## 13. Risks and assumptions

- Telegram API behaviour, rate limits, and webhook constraints may
  change.
- Cloudflare Workers runtime compatibility must be checked for every
  dependency.
- Supabase Free plan quotas may be insufficient for sustained public
  usage.
- Reliable schedules and retries require durable infrastructure; do not
  rely on in-memory timers.
- A workflow engine must impose limits on graph size, execution time,
  retries, and outbound requests.
- A user may connect a bot token that they do not own; terms and abuse
  controls should address this.

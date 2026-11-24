# Vibe Coding Implementation Guide

This document is the source of truth for AI coding assistants and human
contributors. Follow it before generating or changing code.

## 1. Product context

Build RelayNest: a multi-tenant SaaS for creating Telegram bots and
deterministic workflow agents. AI functionality is not part of the MVP.
Render AI-related features as disabled Coming Soon UI only.

## 2. Recommended implementation approach

Start with a single Next.js application deployed to Cloudflare Workers.
Use Next.js Route Handlers for application APIs and Telegram webhooks
initially. Keep the domain logic modular so the webhook and workflow
execution services can later move to a dedicated Worker.

Do not create a separate backend service just for architectural
appearance. Split services when there is a concrete scaling, isolation,
or operational need.

## 3. Non-negotiable coding rules

1.  TypeScript strict mode.
2.  App Router; do not introduce Pages Router.
3.  Server Components by default; use Client Components only for
    interactivity.
4.  Validate every external input with Zod or an equivalent schema.
5.  Perform authorization on the server for every workspace-owned
    resource.
6.  Never trust workspace IDs supplied by the browser without membership
    validation.
7.  Never expose Supabase secret keys, Telegram tokens, encryption keys,
    or provider credentials to the client.
8.  Never log secrets, authorization headers, raw bot tokens, or
    sensitive message contents.
9.  Use database RLS as defence in depth, not as a replacement for
    application authorization.
10. No arbitrary code execution in workflows.
11. No fake success states. Show loading, empty, success, and error
    states.
12. Use pagination for potentially large result sets.
13. Use accessible labels, keyboard navigation, and visible focus
    states.
14. Keep components small and domain-oriented.
15. Pin dependencies and commit the lockfile.
16. Add tests for business logic and security-sensitive paths.
17. Do not invent undocumented Cloudflare or Supabase APIs. Verify
    current official documentation before implementation.
18. Do not implement AI, embeddings, RAG, or AI Gateway calls in the
    MVP.

## 4. Preferred project structure

``` text
relaynest/
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   └── api/
│   ├── components/
│   │   ├── layout/
│   │   ├── dashboard/
│   │   ├── bots/
│   │   ├── agents/
│   │   ├── workflows/
│   │   └── ui/
│   ├── features/
│   │   ├── auth/
│   │   ├── workspaces/
│   │   ├── bots/
│   │   ├── agents/
│   │   ├── workflows/
│   │   ├── integrations/
│   │   └── executions/
│   ├── lib/
│   │   ├── supabase/
│   │   ├── env/
│   │   ├── crypto/
│   │   ├── http/
│   │   └── validation/
│   ├── server/
│   │   ├── auth/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── telegram/
│   │   └── workflow-engine/
│   └── types/
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── public/
├── docs/
├── tests/
├── .env.example
├── package.json
└── README.md
```

Adapt the structure if the selected Cloudflare starter requires a
different layout, but preserve separation of UI, domain logic,
persistence, and external integrations.

## 5. UI implementation standards

- Use Tailwind CSS and shadcn/ui primitives.
- Use Lucide icons.
- Use React Hook Form and Zod for complex forms.
- Use `@xyflow/react` for workflow editing.
- Use a consistent design-token layer; avoid scattering raw hex values.
- Prefer semantic HTML and accessible shadcn components.
- Provide responsive layouts for desktop, tablet, and mobile.
- Dashboard layout: collapsible left sidebar, top header, main content,
  and compact footer.
- Use skeletons for loading and useful empty states for new workspaces.
- Destructive actions require confirmation.
- Never display a full bot token after saving; show a masked value.

## 6. Design tokens

``` css
:root {
  --rn-primary: 99 91 255;
  --rn-secondary: 139 92 246;
  --rn-background: 9 9 11;
  --rn-surface: 24 24 27;
  --rn-border: 39 39 42;
  --rn-text: 250 250 250;
  --rn-muted: 161 161 170;
  --rn-success: 34 197 94;
  --rn-warning: 245 158 11;
  --rn-danger: 239 68 68;
}
```

Use CSS variables and theme tokens rather than hard-coding colors in
every component.

## 7. Domain boundaries

Keep these domains separate: - Identity and workspace membership. - Bot
configuration and credentials. - Telegram transport and webhook
processing. - Agent and workflow definitions. - Workflow validation and
execution. - Integrations and outbound actions. - Execution history and
observability.

Telegram must be an adapter, not the core workflow engine. Future output
adapters should implement the same interface.

## 8. Data access rules

- Use a server-side Supabase client for server operations.
- Use the browser client only for safe user-scoped operations where
  appropriate.
- Use the current Supabase SSR package and documented cookie/session
  approach.
- Use `getUser()` or the currently recommended server-side identity
  verification method for authorization-sensitive operations; do not
  trust unverified client-provided user IDs.
- Never use user-editable profile metadata for authorization.
- Every repository method that reads or mutates tenant data must receive
  an authorized workspace context.
- Use transactions or database functions for multi-row consistency where
  supported and appropriate.
- Use migrations for schema changes.

## 9. API conventions

- JSON APIs under `/api/v1` where practical.
- Use consistent response envelopes.
- Use correct HTTP status codes.
- Validate path params, query params, and request bodies.
- Return stable machine-readable error codes.
- Do not leak stack traces or database internals.
- Use request IDs and execution IDs for tracing.
- Apply rate limits to public endpoints and sensitive actions.

Suggested response:

``` json
{
  "data": {},
  "meta": {
    "requestId": "request-id"
  }
}
```

Suggested error:

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": []
  },
  "meta": {
    "requestId": "request-id"
  }
}
```

## 10. Workflow engine rules

- Workflow definitions are versioned JSON graphs.
- Validate node types, node configuration, graph connectivity, and
  supported edges before activation.
- Reject cycles in MVP unless a bounded loop node is deliberately
  designed.
- Set maximum nodes, maximum execution duration, and maximum outbound
  requests.
- Use idempotency keys for incoming events and action attempts.
- Apply timeouts to all network calls.
- Retry only transient errors, with bounded exponential backoff.
- Never retry permanent validation or authorization failures.
- Store step-level execution results without secrets.
- Do not execute arbitrary user code.

## 11. AI coding workflow

For each feature, instruct the coding assistant to:

1.  Read `README.md`, `PRD.md`, `ARCHITECTURE.md`, and the relevant
    domain document.
2.  Inspect the current repository before editing.
3.  State the files it intends to create or modify.
4.  Implement one vertical slice at a time.
5.  Add or update database migrations.
6.  Add validation and authorization.
7.  Add tests.
8.  Run lint, typecheck, and tests.
9.  Report exact commands and outcomes.
10. List remaining limitations.

Do not ask an AI coding tool to build the entire SaaS in one prompt.
Implement a small, testable slice.

## 12. Reusable master prompt

> You are the senior full-stack engineer for RelayNest. Read the project
> documentation before coding. Implement only the requested feature,
> following the established architecture, TypeScript strictness,
> Supabase RLS, workspace-level authorization, secure secret handling,
> and accessible UI standards. AI features are out of scope and must
> remain Coming Soon. Inspect the existing code before making changes.
> Do not replace working architecture without explaining why. Add
> migrations, validation, tests, loading/empty/error states, and
> documentation as needed. Run lint, typecheck, and relevant tests. Do
> not claim tests passed unless you ran them. Summarize changed files,
> implementation details, commands run, and known limitations.

## 13. Feature prompt template

``` text
Feature:
[Describe one feature]

User story:
As a [user], I want [capability], so that [outcome].

Acceptance criteria:
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]

Relevant docs:
- PRD.md
- ARCHITECTURE.md
- [domain-specific document]

Constraints:
- TypeScript strict mode.
- Server-side authorization.
- Workspace-scoped data access.
- Zod validation.
- No secret exposure.
- Tests required.
- AI features remain Coming Soon.

Before coding:
1. Inspect existing implementation.
2. Identify files and migration changes.
3. Explain implementation plan briefly.

After coding:
1. Run lint, typecheck, and tests.
2. Report exact results.
3. Document any remaining limitations.
```

## 14. Suggested implementation slices

1.  App shell, theme, public landing page.
2.  Supabase auth and protected dashboard.
3.  Workspace bootstrap and RLS.
4.  Bot CRUD without Telegram connectivity.
5.  Encrypted Telegram credentials and token validation.
6.  Telegram webhook receive and `/start` response.
7.  Bot commands and keyword responses.
8.  Agent CRUD and workflow graph persistence.
9.  Workflow validator.
10. Workflow execution engine with Telegram output.
11. Execution history and retry.
12. Analytics, settings, and production hardening.

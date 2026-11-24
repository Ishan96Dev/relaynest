# Architecture Decision Records

## ADR-001: Product scope is deterministic automation first

**Status:** Accepted

**Decision:** MVP supports Telegram bots and deterministic workflows. AI
features are Coming Soon only.

**Reason:** Reduces cost and complexity, provides a useful product
sooner, and creates a stable automation foundation for future AI
features.

## ADR-002: Supabase is the system of record

**Status:** Accepted

**Decision:** Use Supabase Auth, PostgreSQL, and Storage.

**Reason:** Consolidates identity, relational data, and uploaded assets.
RLS provides tenant-level defence in depth.

## ADR-003: Cloudflare Workers is the preferred deployment runtime

**Status:** Accepted, subject to compatibility verification

**Decision:** Deploy the server-capable Next.js application on
Cloudflare Workers using the currently supported deployment approach.

**Reason:** The application needs SSR, authenticated routes, API
handlers, and webhook endpoints. A static-only frontend deployment does
not provide these server capabilities by itself.

## ADR-004: Workflow engine is channel-agnostic

**Status:** Accepted

**Decision:** Model triggers, conditions, and actions independently of
Telegram. Telegram is the first adapter.

**Reason:** Enables future output channels without rewriting workflow
execution semantics.

## ADR-005: No arbitrary user code in workflows

**Status:** Accepted

**Decision:** Users can configure supported node types only. No custom
JavaScript, Python, shell, or arbitrary SQL execution in MVP.

**Reason:** Limits security, isolation, and abuse risks.

## ADR-006: Milvus is future infrastructure

**Status:** Accepted

**Decision:** Do not require Milvus for MVP. Reserve interfaces and
future documentation only.

**Reason:** Vector search has no MVP use case until knowledge-base and
AI features are implemented.

## ADR-007: One deployable application initially

**Status:** Accepted

**Decision:** Start with a modular Next.js application and its Route
Handlers on Workers. Split webhook or workflow execution into separate
Workers only when justified.

**Reason:** Reduces initial deployment and operational complexity while
preserving domain boundaries.

## ADR-008: Published workflow versions are immutable

**Status:** Accepted

**Decision:** Executions reference a stable published workflow version.
Editing creates a new draft/version.

**Reason:** Ensures repeatable execution and reliable audit history.

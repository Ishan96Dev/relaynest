# RelayNest Documentation Index

**Build Telegram Bots. Automate Workflows. Launch Grounded AI Agents.**

RelayNest is a multi-tenant SaaS platform for creating, synchronizing, automating, and monitoring Telegram bots, visual automation flows, AI agents backed by a Knowledge Base RAG system, integrations/webhooks, and scoped workspace APIs.

## Documentation

- **Production Deployment, URLs & Env Matrix (GitHub, Supabase, Cloudflare, Vercel, Render, Redis, Kafka)**: **[`PRODUCTION_AND_CICD_ENV.md`](PRODUCTION_AND_CICD_ENV.md)**
- [Product Requirements Document](PRD.md)
- [Architecture](ARCHITECTURE.md)
- [Database and RLS](DATABASE_SCHEMA.md)
- [API Specification](API_SPEC.md)
- [Integrations, Webhooks, Redis & Kafka Setup](INTEGRATIONS_SETUP.md)
- [Cloudflare Workers Deployment](DEPLOYMENT.md)
- [Environment Variables Reference](ENVIRONMENT.md)
- [Local Development](LOCAL_DEVELOPMENT.md)
- [Knowledge Base & Vector RAG](KNOWLEDGE_BASE.md)
- [Telegram Integration](TELEGRAM_INTEGRATION.md)
- [Workflow Engine](WORKFLOW_ENGINE.md)
- [UI/UX Specification](UI_UX_SPEC.md)
- [Security Requirements](SECURITY.md)
- [Testing Strategy](TESTING.md)
- [GIGW, WCAG 2.1 AA & VA/CA Security Guidelines](GIGW_VACA_ACCESSIBILITY.md)
- [Roadmap](ROADMAP.md)
- [Architecture Decision Records](DECISIONS.md)
- [Supabase Mapping](SUPABASE_MAPPING.md) | [Vibe Coding Guide](VIBE_CODING_GUIDE.md)

## Stack Summary

- **Web App & API**: Next.js 15 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS 4, Lucide, Recharts, React Flow
- **Auth, DB & Storage**: Supabase Auth (SSR + PKCE + Google OAuth), PostgreSQL with RLS, Storage Buckets (`supabase/migrations/`)
- **Bot & Automation Channels**: Telegram Bot API (two-way sync + command/webhook cascade), Slack, Discord, HMAC-SHA256 Webhooks
- **AI & RAG**: NVIDIA Build, Vercel AI Gateway, PDF/text extraction (`unpdf`), Zilliz Cloud / Milvus or Postgres keyword search
- **Distributed Infra**: Upstash Redis REST (rate limiting & idempotency), Upstash Kafka REST (`relaynest.*` topics)
- **Payments, Email & Governance**: Razorpay (Subscriptions, Prepaid, UPI QR), Brevo HTTP API + Auth SMTP, GIGW / WCAG 2.1 AA / VA-CA CI Gate (`pnpm audit:compliance`)

# Production URLs & Environment Variables Guide

Complete production configuration blueprint for **RelayNest** across **GitHub**, **Supabase**, **Frontend Hosting (Cloudflare Pages / Vercel)**, **Backend Hosting (Cloudflare Workers / Render)**, **Upstash Redis**, **Upstash Kafka**, and **Third-Party Integrations (Telegram, Razorpay, Brevo, NVIDIA, Vercel AI Gateway, Google OAuth, Zilliz/Milvus)**.

> **Important Architecture Note:** RelayNest is a unified **Next.js 15 App Router** repository (`frontend/` renders UI pages and `frontend/src/app/api/*` hosts all REST/webhook handlers importing server logic from `backend/`).
> - **Recommended Production Topology:** Deploy RelayNest as **one full-stack app** on **Cloudflare Workers (OpenNext)**, **Vercel**, or a **Render Web Service** so pages and `/api/*` share the same HTTPS origin (zero CORS or cookie-domain issues).
> - **Split Frontend / Backend Topology:** If you host only static/UI on **Cloudflare Pages** or **Vercel** and API routes on **Cloudflare Workers** or **Render**, configure `/api/*` rewrites/proxies from your frontend host to your backend host (browser calls relative `/api/*` endpoints).

---

## 1. Master Production URL Checklist

Replace `<APP_URL>` (`https://app.yourdomain.com` or your single HTTPS domain) and `<API_URL>` (same as `<APP_URL>` unless split; if split, use your backend URL such as `https://api.yourdomain.com`):

| Service | Setting / Field Name | Exact Value to Add |
| --- | --- | --- |
| **Supabase Auth** | **Site URL** | `<APP_URL>` |
| **Supabase Auth** | **Redirect URLs** | `<APP_URL>`<br>`<APP_URL>/auth/callback`<br>`<APP_URL>/reset-password`<br>*(Optional preview deploys)* `https://*.pages.dev/auth/callback` / `https://*.vercel.app/auth/callback` |
| **Google Cloud OAuth** | **Authorized JavaScript origins** | `<APP_URL>` |
| **Google Cloud OAuth** | **Authorized redirect URIs** | `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback` |
| **GitHub Actions** | **Repository Variable `NEXT_PUBLIC_APP_URL`** | `<APP_URL>` |
| **Telegram Bot API** | **Per-bot Webhook URL** *(auto-set when `NEXT_PUBLIC_APP_URL` is `https://` & `TELEGRAM_UPDATES_MODE=auto`)* | `<API_URL>/api/webhooks/telegram/<botPublicId>` |
| **Incoming Webhooks** | **External Workflow Trigger URL** *(generated in app under `/integrations`)* | `<API_URL>/api/webhooks/workflows/<publicId>` |
| **Razorpay Dashboard** | **Webhook URL** *(Test or Live Mode matching keys)* | `<API_URL>/api/webhooks/razorpay` |
| **Cron / Scheduler** | **Scheduled Tick Endpoint** | `POST <API_URL>/api/cron/tick` *(Header: `Authorization: Bearer <CRON_SECRET>`)* |
| **Upstash Kafka Webhook / Consumer** | **Kafka Consumer Dispatch Endpoint** | `POST <API_URL>/api/queues/kafka` *(Header: `Authorization: Bearer <KAFKA_CONSUMER_SECRET>`)* |
| **OpenAPI & Swagger UI** | **OpenAPI 3.1 Spec & In-App UI** | Spec: `<API_URL>/api/v1/openapi.json`<br>In-App UI: `<APP_URL>/api-docs` |
| **Supabase Edge Function** | **Account Deletion Email (`send-account-deleted`)** | `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/send-account-deleted` |
| **Health Probe** | **Load Balancer / Uptime Health Check** | `GET <API_URL>/api/health` |
| **Admin Portal** | **Owner-Only Console** *(noindex/no-store enforced)* | `<APP_URL>/admin` |

---

## 2. GitHub Repository Setup (`github.com` + CI/CD)

CI runs via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) on every pull request and push to `main`:
`pnpm audit:compliance` -> `pnpm lint` -> `pnpm typecheck` -> `pnpm test` -> `pnpm build` -> *(optional)* Cloudflare OpenNext deploy.

Open **GitHub Repo -> Settings -> Secrets and variables -> Actions**:

### Repository Variables (`Variables` tab — Public / Build-Time)

| Variable | Example / Value | Required |
| --- | --- | --- |
| `CLOUDFLARE_DEPLOY` | `true` *(enable auto-deploy on `main`)* | For CF auto-deploy |
| `CLOUDFLARE_PAGES_PROJECT` | `relaynest` *(only if syncing `.open-next/assets` to CF Pages)* | Optional |
| `NEXT_PUBLIC_APP_URL` | `https://app.yourdomain.com` | **Yes** |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | **Yes** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | **Yes** |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Optional |

### Repository Secrets (`Secrets` tab — Private)

| Secret | Where to get it | Needed for |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Profile -> API Tokens -> **Edit Cloudflare Workers** + **Cloudflare Pages Edit** | Cloudflare CI deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard -> Workers & Pages -> Overview right sidebar | Cloudflare CI deploy |
| `RENDER_DEPLOY_HOOK_URL` | Render Service -> Settings -> Deploy Hook *(if wiring custom Render CD)* | Optional Render CD |
| `VERCEL_TOKEN` | Vercel -> Account Settings -> Tokens *(if wiring custom Vercel CD)* | Optional Vercel CD |

> **Manual Git Push Check:** Before running `git push`, verify `git status` shows no `.env`, `.dev.vars`, `.next*`, `.editorconfig`, `.playwright-mcp/`, or `.agents/` files. See [`.gitignore`](../.gitignore).

---

## 3. Supabase Setup (Database, Auth, Storage, Templates)

1. **Create Project & Copy Keys** (**Project Settings -> API**):
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable Key** (`sb_publishable_...`) -> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Secret Key** (`sb_secret_...`) -> `SUPABASE_SECRET_KEY` *(server-only!)*
2. **Apply All 14 SQL Migrations in Order** (via SQL Editor or `supabase db push`):
   - `supabase/migrations/20260101000000_init.sql` through `supabase/migrations/20260101001400_brand_assets_bucket.sql`.
3. **Authentication -> URL Configuration**:
   - **Site URL:** `https://app.yourdomain.com`
   - **Redirect URLs:** `https://app.yourdomain.com`, `https://app.yourdomain.com/auth/callback`, `https://app.yourdomain.com/reset-password`
4. **Google OAuth Provider** (**Authentication -> Providers -> Google**):
   - In Google Cloud Console, add Authorized Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Supabase (or push automatically via `pnpm auth:config`).
5. **Custom Auth SMTP & Branded Email Templates**:
   - Get `SUPABASE_ACCESS_TOKEN` (`supabase.com/dashboard/account/tokens`), `BREVO_SMTP_LOGIN`, and `BREVO_SMTP_KEY` (Brevo -> **SMTP & API -> SMTP** tab).
   - Upload the RelayNest brand logo into Supabase Storage's public `brand` bucket (`<project-ref>.supabase.co/storage/v1/object/public/brand/logo-icon-128.png`), rebuild templates so logos render cleanly in Supabase Preview, Gmail, and Outlook, and apply config:
     ```bash
     pnpm emails:logo
     pnpm emails
     pnpm auth:config
     ```
   - Or paste `supabase/templates/*.html` inside **Supabase Auth -> Email Templates** (`pnpm auth:config` pushes SMTP + 8 Auth templates including `reauthentication.html` used before Delete Account).
   - **Account Deletion Email (`account_deleted.html`):** Deploy the included Edge Function so Supabase delivers branded account-deletion confirmation emails automatically when a user deletes their account via **Settings -> Security & Access**:
     ```bash
     supabase functions deploy send-account-deleted
     supabase secrets set BREVO_API_KEY=... MAIL_FROM_ADDRESS=noreply@yourdomain.com MAIL_FROM_NAME=RelayNest
     ```
     *(You can alternatively set `RESEND_API_KEY` instead of `BREVO_API_KEY` on the Edge Function. Make sure `MAIL_FROM_ADDRESS` uses a verified sender/domain; otherwise RelayNest automatically falls back to server-side Brevo HTTP API using `accountDeletedEmail` if `BREVO_API_KEY` is configured in backend runtime secrets.)*
6. **Seed Admin Credentials**:
   - Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (or `ADMIN_PASSWORD_HASH`) in backend secrets, and optionally run `node --env-file=.env scripts/set-admin.mjs <email> <strong-password>` to store a PBKDF2 admin hash in `platform_admins`.

---

## 4. Frontend Hosting Options (Cloudflare Pages & Vercel)

Because Next.js App Router relies on SSR, middleware auth protection (`backend/src/lib/supabase/middleware.ts`), and cookies, deploy with SSR/edge adapter support — **do NOT use `next export` static HTML export**.

### Option A: Vercel (Full-Stack Next.js or Frontend Proxy)

1. Import your GitHub repository in **Vercel -> Add New -> Project**.
2. Set **Root Directory** to `./` (repository root, because `frontend/` imports `@backend/*` and `@/*`).
3. Build & Output Overrides:
   - **Install Command:** `pnpm install --frozen-lockfile`
   - **Build Command:** `pnpm build` *(runs `next build frontend`)*
   - **Output Directory:** `frontend/.next`
4. **Environment Variables (Production + Preview):**
   - Required public vars: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME=RelayNest`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` (optional).
   - If hosting full-stack on Vercel (recommended when using Vercel), also add all server secrets from Section 6 below.
   - If splitting Backend onto Render/Cloudflare Workers while keeping Frontend on Vercel, add a Next.js rewrite in `frontend/next.config.ts` forwarding `/api/:path*` -> `https://api.yourdomain.com/api/:path*`, and set `NEXT_PUBLIC_APP_URL=https://app.yourdomain.com`.
5. **Vercel Cron (`vercel.json` or External Cron):** Because Vercel is serverless, leave `SCHEDULER_IN_PROCESS` empty and call `POST https://<domain>/api/cron/tick` every minute with header `Authorization: Bearer <CRON_SECRET>`.

### Option B: Cloudflare Pages (with OpenNext Static + Worker Integration)

1. Recommended integration with Cloudflare Workers: `.github/workflows/ci.yml` already supports building via `@opennextjs/cloudflare` (`npx @opennextjs/cloudflare build`) which produces:
   - `.open-next/assets` (static frontend assets, deployed optionally to Cloudflare Pages via `CLOUDFLARE_PAGES_PROJECT`)
   - `.open-next/worker.js` (SSR pages + `/api/*` backend Worker configured in `wrangler.jsonc`).
2. Required **Cloudflare Pages Build Environment Variables**:
   - `NEXT_PUBLIC_APP_URL` = `https://app.yourdomain.com`
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...`
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-XXXXXXXXXX` *(optional)*
3. Set `NODE_VERSION=22` in Cloudflare Pages build settings. If splitting Pages frontend from a separate Backend Worker/Render API, route `/api/*` via Cloudflare Worker Route or Pages Function proxy (`functions/api/[[path]].js`) to your backend domain so auth cookies stay first-party.

---

## 5. Backend / Server Hosting Options (Cloudflare Workers & Render)

### Option A: Cloudflare Workers (`wrangler.jsonc` — Recommended Edge Host)

[`wrangler.jsonc`](../wrangler.jsonc) is pre-configured with `nodejs_compat`, `.open-next/worker.js`, and a minute Cron Trigger (`* * * * *`).

1. Build locally or via CI:
   ```bash
   npx @opennextjs/cloudflare build
   ```
2. Push all server secrets via Wrangler CLI (never put secrets in `wrangler.jsonc` or Git):
   ```bash
   wrangler secret put SUPABASE_SECRET_KEY
   wrangler secret put ENCRYPTION_KEY
   wrangler secret put CRON_SECRET
   wrangler secret put ADMIN_EMAIL
   wrangler secret put ADMIN_PASSWORD_HASH   # or ADMIN_PASSWORD
   wrangler secret put RAZORPAY_KEY_ID
   wrangler secret put RAZORPAY_KEY_SECRET
   wrangler secret put RAZORPAY_WEBHOOK_SECRET
   wrangler secret put BREVO_API_KEY
   wrangler secret put NVIDIA_API_KEY
   wrangler secret put AI_GATEWAY_API_KEY
   wrangler secret put UPSTASH_REDIS_REST_URL
   wrangler secret put UPSTASH_REDIS_REST_TOKEN
   wrangler secret put UPSTASH_KAFKA_REST_URL
   wrangler secret put UPSTASH_KAFKA_REST_USERNAME
   wrangler secret put UPSTASH_KAFKA_REST_PASSWORD
   wrangler secret put KAFKA_CONSUMER_SECRET
   ```
3. Non-secret runtime vars (`wrangler.jsonc` `"vars"` or Cloudflare Dashboard -> Worker Settings -> Variables):
   - `APP_ENV=production`, `ENCRYPTION_KEY_VERSION=v1`, `TELEGRAM_API_BASE_URL=https://api.telegram.org`, `TELEGRAM_UPDATES_MODE=auto`, `MAIL_FROM_ADDRESS=noreply@yourdomain.com`, `MAIL_FROM_NAME=RelayNest`, `KAFKA_TOPIC_PREFIX=relaynest`, `LOG_LEVEL=info`, `SCHEDULER_IN_PROCESS=` *(leave empty on Workers!)*.
4. Deploy Worker:
   ```bash
   npx wrangler deploy
   ```
   > **Asset Limit Note:** Cloudflare Workers static assets must stay under **25 MB** per file (`frontend/public/video/relaynest-product-demo.mp4` is currently kept under `25 MB` for this limit).

### Option B: Render (Persistent Node.js Web Service)

Use **Render Web Service** if you want persistent Node processes (supports optional in-process scheduler `SCHEDULER_IN_PROCESS=true` and optional gRPC/HTTP `MILVUS_URI` self-hosted connections).

1. **New -> Web Service -> Connect GitHub Repo**:
   - **Environment:** `Node` (Node 22 via `.nvmrc`)
   - **Build Command:** `pnpm install --frozen-lockfile && pnpm build`
   - **Start Command:** `pnpm start` *(runs `next start frontend`, reads `$PORT` automatically)*
   - **Health Check Path:** `/api/health`
2. **Environment Variables (Render Dashboard -> Environment):**
   - Set `NODE_ENV=production`, `APP_ENV=production`, `NEXT_PUBLIC_APP_URL=https://<your-render-or-custom-domain>`, `TELEGRAM_UPDATES_MODE=auto`, `SCHEDULER_IN_PROCESS=true` *(or set up a Render Cron Job calling `POST https://<domain>/api/cron/tick` with `CRON_SECRET`)*.
   - Add all Required + Feature variables listed in Section 6 directly in Render's **Environment Variables / Secret Files** panel.

---

## 6. Upstash Redis & Upstash Kafka Configuration

RelayNest communicates with **Redis** and **Kafka** over **HTTPS REST APIs** (`backend/src/server/cache/redis.ts` & `backend/src/server/queue/kafka.ts`), making them 100% compatible with both Node.js (Render/Vercel) and Cloudflare Workers (where raw TCP `ioredis`/`kafkajs` sockets do not run).

### A. Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
1. Go to [console.upstash.com](https://console.upstash.com) -> **Redis** -> **Create Database**.
2. Pick a region close to your Supabase and Cloudflare/Render region, enable TLS (default), and create.
3. Open **REST API** -> copy:
   - `UPSTASH_REDIS_REST_URL` (`https://<your-db>.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (`AX...`)
   *(RelayNest also accepts `REDIS_REST_URL` / `REDIS_REST_TOKEN` as aliases. When omitted, rate limiting and caches fall back to local per-instance memory.)*

### B. Kafka (`UPSTASH_KAFKA_*`, `KAFKA_TOPIC_PREFIX`, `KAFKA_CONSUMER_SECRET`)
1. In [console.upstash.com](https://console.upstash.com), open **Kafka** -> **Create Cluster**.
2. Create these **4 topics** matching your prefix (default `relaynest`):
   - `relaynest.telegram.updates`
   - `relaynest.workflows.execute`
   - `relaynest.audit.events`
   - `relaynest.notifications.dispatch`
3. From **Cluster Details -> REST API**, copy:
   - `UPSTASH_KAFKA_REST_URL` (`https://<cluster>.upstash.io`)
   - `UPSTASH_KAFKA_REST_USERNAME`
   - `UPSTASH_KAFKA_REST_PASSWORD`
4. Set:
   - `KAFKA_TOPIC_PREFIX=relaynest`
   - `KAFKA_CONSUMER_SECRET=<64-char-hex-secret>` *(authenticates `POST <API_URL>/api/queues/kafka` via `Authorization: Bearer <KAFKA_CONSUMER_SECRET>`)*
5. Verify live connectivity inside RelayNest at **`<APP_URL>/admin/services`** — **Redis** and **Kafka** cards will show green `Connected` / `PONG` status.

---

## 7. Complete Environment Variable Matrix

| Group | Variable | Browser-Exposed (`NEXT_PUBLIC_`)? | Where Set in Production |
| --- | --- | --- | --- |
| **Core** | `NEXT_PUBLIC_APP_NAME` | Yes (`RelayNest`) | Build + Runtime (CF Pages / Vercel / Render / GitHub `vars`) |
| **Core** | `NEXT_PUBLIC_APP_URL` | Yes (`https://app.yourdomain.com`) | Build + Runtime + GitHub `vars` |
| **Core** | `APP_ENV` | No (`production`) | Runtime (Workers / Render / Vercel) |
| **Core** | `NEXT_PUBLIC_SUPABASE_URL` | Yes (`https://<ref>.supabase.co`) | Build + Runtime + GitHub `vars` |
| **Core** | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (`sb_publishable_...`) | Build + Runtime + GitHub `vars` |
| **Core** | `SUPABASE_SECRET_KEY` | **No (Secret)** | Backend Runtime Secret only |
| **Core** | `ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION` | **No (Secret)** | Backend Runtime Secret (`64`-char hex, `v1`) |
| **Admin** | `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` *(or `ADMIN_PASSWORD`)* | **No (Secret)** | Backend Runtime Secret only |
| **Telegram** | `TELEGRAM_API_BASE_URL`, `TELEGRAM_UPDATES_MODE` | No | Backend Runtime (`https://api.telegram.org`, `auto`) |
| **Scheduler** | `CRON_SECRET`, `SCHEDULER_IN_PROCESS` | **No (Secret)** | Backend Secret; `SCHEDULER_IN_PROCESS=true` on Render only |
| **Redis** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **No (Secret)** | Backend Runtime Secret |
| **Kafka** | `UPSTASH_KAFKA_REST_URL`, `UPSTASH_KAFKA_REST_USERNAME`, `UPSTASH_KAFKA_REST_PASSWORD`, `KAFKA_TOPIC_PREFIX`, `KAFKA_CONSUMER_SECRET` | **No (Secret)** | Backend Runtime Secret (`KAFKA_TOPIC_PREFIX=relaynest`) |
| **AI** | `NVIDIA_API_KEY`, `AI_GATEWAY_API_KEY`, `PLATFORM_ADMIN_EMAILS`, `NVIDIA_PRICE_INPUT_PER_MTOK`, `NVIDIA_PRICE_OUTPUT_PER_MTOK` | **No (Secret)** | Backend Runtime Secret |
| **Vector KB** | `MILVUS_URI`, `MILVUS_TOKEN`, `MILVUS_DB_NAME`, `MILVUS_COLLECTION` | **No (Secret)** | Backend Runtime Secret (Optional) |
| **Billing** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | **No (Secret)** | Backend Runtime Secret (`rzp_live_...`) |
| **Email** | `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` *(+ optional `RESEND_API_KEY` on Edge Function)* | **No (Secret)** | Backend Runtime Secret + Supabase `send-account-deleted` Edge Function Secret |
| **Auth CLI** | `SUPABASE_ACCESS_TOKEN`, `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **No (Local CLI Only)** | Only local `.env` when running `pnpm auth:config` |
| **Analytics** | `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Yes (`G-XXXXXXXXXX`) | Build + Runtime + GitHub `vars` (Optional) |

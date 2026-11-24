# Integrations Setup Guide

Every value below goes in the root `.env` for local development. In production (Cloudflare) add the same names as
Worker/Pages **secrets** (see `docs/DEPLOYMENT.md`). Restart the dev server after editing `.env`.
Anything left empty simply disables that feature; the app keeps working.

## 1. Supabase (database + auth)

1. https://supabase.com → New project.
2. Project Settings → API: copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`, **publishable key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, **secret key** → `SUPABASE_SECRET_KEY` (server only, never expose).
3. Apply all migrations in `supabase/migrations/` in numeric order (SQL Editor or `supabase db push`), from `20260101000000_init.sql` through `20260101001300_api_keys_integrations.sql`.
4. Generate `ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 2. Razorpay (billing: Free ₹0, Pro ₹749, Business ₹2,399)

Supports one-time (prepaid period, Razorpay Orders), UPI QR, and recurring (Razorpay Subscriptions) in INR (₹).
Annual billing is 12 months at 20% off. Prices live in `backend/src/lib/billing/plans.ts`.

1. https://dashboard.razorpay.com → switch to **Test Mode** (top bar).
2. Settings → API Keys → Generate Key: `RAZORPAY_KEY_ID` (`rzp_test_...`) and `RAZORPAY_KEY_SECRET`.
3. Settings → Webhooks → Add: URL `https://<your-domain>/api/webhooks/razorpay`, choose your own secret →
   `RAZORPAY_WEBHOOK_SECRET`. Tick: `subscription.*` (authenticated, activated, charged, pending, halted, cancelled,
   completed, resumed), `order.paid`, `payment.failed`, `payment.refunded`, `refund.processed`, **`qr_code.credited`** (UPI QR payments).
   Locally, expose port 3000 with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`).
4. Billing runs in **INR**, which works immediately on Indian Razorpay accounts without needing International Payments approval.
5. Test card: `4111 1111 1111 1111`, any future expiry, any CVV. Go live by swapping to `rzp_live_` keys and a live-mode webhook.

Plan IDs are created on demand in Razorpay and cached in `razorpay_plans`. The webhook is signature-verified and idempotent (`billing_events`).

### UPI QR (INR)

With the currency set to INR, each paid plan has a **Pay via UPI QR** button. The server creates a fixed-amount,
single-use Razorpay QR (valid 15 minutes) tagged with the workspace and plan. The customer scans it with any UPI app;
the browser polls `GET /api/v1/billing/upi-qr/<qrId>` and the `qr_code.credited` webhook is the safety net, so the plan
activates automatically and an invoice and receipt are created. It is a one-time prepaid period (UPI QR cannot auto-renew).

- Requires **UPI QR Codes** enabled on your Razorpay account (Dashboard → Payments → QR Codes; Razorpay may need to activate it for your account). In test mode you can simulate a payment from the QR's page in the dashboard.
- You do not upload your own static QR image. A static QR cannot be matched to a workspace or amount automatically, so the app generates a QR per order instead.
- **Recurring UPI (AutoPay)**: choose *Auto-renew* with INR and Razorpay Checkout offers UPI mandates automatically once UPI AutoPay is enabled on your account.

## 3. Brevo email

Two separate things:

- **App & Account Lifecycle emails** (receipts, payment failure alerts, and permanent account deletion confirmation via `accountDeletedEmail`), sent by `backend/src/server/email/mailer.ts` through Brevo's HTTP API (raw SMTP does not work on Cloudflare Workers).
  Brevo → top-right menu → **SMTP & API → API Keys → Generate** → `BREVO_API_KEY`.
  Set `MAIL_FROM_ADDRESS` to a **verified sender** (Brevo → Senders, Domains & Dedicated IPs; add and authenticate your domain with the DKIM/SPF/DMARC DNS records it shows) and `MAIL_FROM_NAME`.
  *(Optional Supabase Edge Function)*: Deploy `supabase functions deploy send-account-deleted` with `BREVO_API_KEY` (or `RESEND_API_KEY`), `MAIL_FROM_ADDRESS`, and `MAIL_FROM_NAME` in Supabase Edge Function secrets so Supabase sends `account_deleted.html` first before falling back to Brevo HTTP API.
- **Supabase Auth emails** (verify email, reset password, account-deletion reauthentication code, password/email change alerts) use SMTP. Brevo → SMTP & API → **SMTP** tab: `BREVO_SMTP_LOGIN` (login) and `BREVO_SMTP_KEY` (SMTP key, not the API key). Also set `SUPABASE_ACCESS_TOKEN`
  (supabase.com/dashboard/account/tokens), then run `pnpm auth:config` once to push SMTP settings and the 8 Supabase Auth templates (`supabase/templates/*.html`).

## 4. Google Analytics 4 (traffic)

1. https://analytics.google.com → Admin → Create property → Web data stream with your site URL.
2. Copy the **Measurement ID** (`G-XXXXXXXXXX`) → `NEXT_PUBLIC_GA_MEASUREMENT_ID`. It is baked in at build time, so rebuild/redeploy after changing it.
3. Page views are sent on every route change; a consent banner (Consent Mode v2) controls analytics storage.
4. View traffic in GA → Reports → Realtime / Acquisition / Engagement. Use `?` DebugView or Realtime to confirm it works.

## 5. AI usage and cost

Every model call writes a row to `ai_usage_events` (tokens, cost in USD, latency, model, origin). The **Analytics** page
shows totals, per-provider, per-model, per-origin and daily charts, limited by the plan's analytics window.

- **NVIDIA** (`NVIDIA_API_KEY`, from https://build.nvidia.com): there is no public usage-history endpoint, so usage is recorded from each response's `usage` field. NVIDIA Build is a free trial tier, so cost is `$0`; optionally set `NVIDIA_PRICE_INPUT_PER_MTOK` / `NVIDIA_PRICE_OUTPUT_PER_MTOK` (USD per million tokens) if you are on paid hosting.
- **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`, from https://vercel.com/ai-gateway): cost comes from the gateway response, and the shared account balance and lifetime spend come from `GET /v1/credits`. That balance is shown only to emails in `PLATFORM_ADMIN_EMAILS` (comma-separated). Vercel's own dashboard shows gateway spend by model too. Vercel does not host your frontend here (Cloudflare does), so there is no Vercel web analytics.

## 6. Automations and Telegram scheduling

- Workflows persist in `workflows`; schedules (cron expression + timezone) in `workflow_schedules`; every run is logged in `executions`.
- Set `CRON_SECRET` to any long random string. `POST /api/cron/tick` with `Authorization: Bearer <CRON_SECRET>` runs due schedules.
  - **Locally**: the scheduler runs inside the dev server automatically.
  - **Cloudflare**: add a Cron Trigger (`* * * * *`) whose handler calls that URL with the header (or use any external pinger such as cron-job.org). Leave `SCHEDULER_IN_PROCESS` empty there.
- Telegram: create a bot with @BotFather and paste its token in the app. `TELEGRAM_UPDATES_MODE=auto` polls locally and uses webhooks when `NEXT_PUBLIC_APP_URL` is https.

## 7. Cloudflare production notes

- **Cloudflare Workers / Render / Vercel Production Notes**: Set `NEXT_PUBLIC_APP_URL` to your final HTTPS URL and add `<domain>` + `<domain>/auth/callback` to Supabase Auth -> URL Configuration. See `docs/PRODUCTION_AND_CICD_ENV.md` for full multi-platform guides.

## 8. Knowledge Base (optional)

Without `MILVUS_URI` the Knowledge Base uses keyword search. For semantic search set `MILVUS_URI`, `MILVUS_TOKEN`
(Zilliz Cloud free tier works). See `docs/KNOWLEDGE_BASE.md`.

## 9. Upstash Redis + Upstash Kafka (distributed cache & event streaming)

RelayNest uses HTTPS REST clients (`backend/src/server/cache/redis.ts` and `backend/src/server/queue/kafka.ts`) so everything works seamlessly on both Node.js and Cloudflare Workers without TCP sockets.

### Step 1 — Get Upstash Redis values (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
1. Go to [https://console.upstash.com](https://console.upstash.com) and sign in (free tier works).
2. Open the **Redis** tab → click **Create Database**.
3. Give it a name (e.g. `relaynest-cache`), choose your primary region (match your Cloudflare/Supabase region), and click **Create**.
4. Inside your new Redis database page, scroll to the **REST API** card (select `.env` tab).
5. Copy:
   - `UPSTASH_REDIS_REST_URL` (`https://<your-db>.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (`AX...` bearer token)

### Step 2 — Get Upstash Kafka values (`UPSTASH_KAFKA_REST_URL`, `UPSTASH_KAFKA_REST_USERNAME`, `UPSTASH_KAFKA_REST_PASSWORD`)
1. In the Upstash Console, switch to the **Kafka** tab → click **Create Cluster**.
2. Choose a cluster name (e.g. `relaynest-events`) and region → click **Create**.
3. Open **Topics** inside the cluster and create the 4 topics using your prefix (default `relaynest`):
   - `relaynest.telegram.updates`
   - `relaynest.workflows.execute`
   - `relaynest.audit.events`
   - `relaynest.notifications.dispatch`
4. Open the cluster **Details / REST API** section on the overview page and copy:
   - `UPSTASH_KAFKA_REST_URL` (the HTTPS REST Endpoint URL)
   - `UPSTASH_KAFKA_REST_USERNAME`
   - `UPSTASH_KAFKA_REST_PASSWORD`
   > **Note:** If you only have Redis configured for now, leave the three `UPSTASH_KAFKA_REST_*` variables blank — RelayNest skips Kafka cleanly and still runs normally.

### Step 3 — Topic prefix & Consumer secret (`KAFKA_TOPIC_PREFIX`, `KAFKA_CONSUMER_SECRET`)
1. Set `KAFKA_TOPIC_PREFIX=relaynest` (or change it if sharing a cluster across staging/prod).
2. Generate `KAFKA_CONSUMER_SECRET` locally with Node.js:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Paste that 64-character hex string into `KAFKA_CONSUMER_SECRET` (in `.env` locally and via `wrangler secret put KAFKA_CONSUMER_SECRET` in production). Your scheduled cron/worker hits `POST /api/queues/kafka` with header `Authorization: Bearer <KAFKA_CONSUMER_SECRET>`.
4. Open `/admin/services` in RelayNest to confirm **Redis** shows `PONG · Upstash Redis REST connected` and **Kafka** shows `Connected · prefix "relaynest"`.

## Environment checklist

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ENCRYPTION_KEY` | Core (required) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Billing |
| `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | App emails |
| `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`, `SUPABASE_ACCESS_TOKEN` | Auth emails (`pnpm auth:config`) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics |
| `NVIDIA_API_KEY`, `AI_GATEWAY_API_KEY`, `PLATFORM_ADMIN_EMAILS` | AI models and usage |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Distributed cache & idempotency |
| `UPSTASH_KAFKA_REST_URL`, `UPSTASH_KAFKA_REST_USERNAME`, `UPSTASH_KAFKA_REST_PASSWORD`, `KAFKA_TOPIC_PREFIX`, `KAFKA_CONSUMER_SECRET` | Event streaming & worker queue |
| `CRON_SECRET` | Scheduled automations |

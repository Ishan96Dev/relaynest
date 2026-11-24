# Production Deployment Overview (Cloudflare, Vercel & Render)

> **See Also:** [`docs/PRODUCTION_AND_CICD_ENV.md`](PRODUCTION_AND_CICD_ENV.md) for the exact step-by-step **URL checklist**, **GitHub Actions secrets/vars**, **Supabase redirects & email setup**, **Cloudflare Pages**, **Vercel**, **Cloudflare Workers**, **Render**, **Upstash Redis**, and **Upstash Kafka** environment matrices.

## 1. Target

Deploy RelayNest's Next.js application and server endpoints to
Cloudflare Workers (`@opennextjs/cloudflare` via `wrangler.jsonc`), Vercel, or a Render Node.js Web Service.

Official starting points: -
https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ -
https://developers.cloudflare.com/workers/configuration/secrets/ -
https://developers.cloudflare.com/workers/wrangler/

Cloudflare's Next.js support and recommended tooling evolve. Verify the
current guide before selecting a starter or build adapter. Evaluate
vinext if it is the currently recommended path, noting its maturity and
compatibility limits.

## 2. Why Workers

The app needs server-side rendering, authenticated routes, API handlers,
and Telegram webhook endpoints. A static-only deployment is insufficient
for these features without a separate backend.

## 3. Deployment sequence

1.  Create Cloudflare account.
2.  Create GitHub repository.
3.  Configure the supported Next.js-on-Workers starter.
4.  Run locally.
5.  Test build using the Cloudflare runtime.
6.  Connect repository to Cloudflare deployment workflow.
7.  Configure environment variables and secrets.
8.  Deploy preview.
9.  Test auth redirects and callbacks.
10. Configure custom domain.
11. Update Supabase auth redirect allowlist.
12. Register Telegram webhook using production HTTPS URL.
13. Test end-to-end flow.
14. Monitor Worker logs and errors.

## 4. Domains

Suggested: - `relaynest.com`: marketing site. - `app.relaynest.com`:
application. - `api.relaynest.com`: optional dedicated API/webhook
host. - `docs.relaynest.com`: documentation.

For MVP, one Worker can serve app and API routes under one domain. A
separate API hostname is optional.

## 5. Secrets

Store server secrets using Cloudflare Worker Secrets: - Supabase secret
key if needed. - Application encryption key. - Any webhook signing
secrets. - Third-party integration credentials.

Do not put secrets in committed Wrangler config or frontend variables.

## 6. Supabase production configuration

- Add production app URL to allowed redirect URLs.
- Configure email templates and SMTP.
- Verify RLS and grants.
- Confirm Storage policies.
- Use production database credentials.
- Configure backups/retention appropriate to the plan.
- Test account deletion and session invalidation behaviour.

## 7. Telegram production configuration

- Use production HTTPS webhook URL.
- Register a unique webhook per connected bot.
- Validate webhook secret header.
- Configure only needed update types.
- Monitor webhook errors.
- Provide a re-register operation.

## 8. CI/CD

Recommended pipeline: 1. Install using lockfile. 2. Lint. 3. Typecheck.
4. Unit tests. 5. Build. 6. Deploy preview for pull requests if
configured. 7. Deploy production from protected main branch.

Use scoped Cloudflare API tokens in CI secrets.

## 9. Operational readiness

Before public launch: - Error monitoring. - Structured logs. - Request
IDs. - Execution IDs. - Rate limits. - Database backup plan. - Secret
rotation procedure. - Incident response contact. - Abuse reporting and
suspension capability. - Terms and privacy policy.

## 10. Cost and limits

Check current Cloudflare and Supabase quotas before launch. Free tiers
are subject to limits and policy changes. Add usage caps to prevent one
workspace from exhausting shared resources.

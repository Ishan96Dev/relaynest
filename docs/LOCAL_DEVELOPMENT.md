# Local Development

## 1. Prerequisites

- Git.
- A supported Node.js LTS version compatible with the chosen
  Next.js/Cloudflare toolchain.
- pnpm or npm (choose one package manager and commit its lockfile).
- Supabase project or local Supabase CLI stack.
- Telegram account for creating a test bot.
- Cloudflare account for deployment testing.

## 2. Create repository

``` bash
git clone <your-repository-url>
cd relaynest
```

## 3. Install dependencies

Use the package manager selected by the project. Example:

``` bash
pnpm install
```

## 4. Configure environment

``` bash
cp .env.example .env.local
```

Fill in Supabase values. Do not commit `.env.local`.

## 5. Supabase setup

- Create project.
- Apply migrations.
- Enable required auth providers.
- Configure redirect URLs for local development.
- Create Storage buckets.
- Verify RLS policies.
- Configure SMTP (`pnpm auth:config`) and regenerate email templates (`pnpm emails`) before Auth/security email testing.
- Set `BREVO_API_KEY` + `MAIL_FROM_ADDRESS` (or deploy `supabase/functions/send-account-deleted`) before testing transactional billing or Delete Account confirmation emails.

Use the current Supabase CLI documentation and `supabase --help` to
confirm commands for the installed CLI version.

## 6. Start development server

``` bash
pnpm dev
```

Open `http://localhost:3000` (`scripts/dev-web.mjs` binds port `3000` by default and logs clearly or moves to `3001` if another local process holds IPv4/IPv6 `:3000`; run `npm run dev:3000` to bind `http://127.0.0.1:3000` directly if only IPv6 `:::3000` is occupied).

If using a Cloudflare-specific development runtime, use the scripts
provided by the selected starter and test under that runtime as well as
local Next.js development.

## 7. Telegram local webhook testing

Telegram webhooks require a publicly reachable HTTPS endpoint. For local
development: - Use a secure tunnel suitable for development. - Do not
expose a production bot token in a shared tunnel. - Use a dedicated test
bot. - Restrict webhook update types. - Remove the webhook when finished
if necessary.

## 8. Quality commands

Provide and maintain scripts such as:

``` bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not mark a feature complete until relevant commands pass.

## 9. Git workflow

Suggested branches: - `main`: production-ready. - `develop`: integration
branch if the team needs it. - `feature/<short-name>`: feature work. -
`fix/<short-name>`: bug fixes.

Use small commits and pull requests. Require typecheck, lint, and tests
in CI.

## 10. Repository commands (this repo)

See the root README for the layout. In short: `pnpm dev` runs the web app and the backend supervisor together,
`pnpm dev:demo` runs with sample data and no credentials, and `pnpm images` regenerates optimized images.
Apply every file in `supabase/migrations` in numeric order (`20260101000000_init.sql` through `20260101001400_brand_assets_bucket.sql`).

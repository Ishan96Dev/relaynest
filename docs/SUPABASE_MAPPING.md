# Supabase mapping

Which page reads or writes which Supabase object, plus the Auth, SMTP and email-template setup.
All browser access goes through row-level security (RLS) as the signed-in member.

## Pages

| Page | Reads | Writes |
| --- | --- | --- |
| Header (all dashboard pages) | Token claims: `full_name`, `avatar_path`. `notifications` unread count (after paint) | none |
| `/dashboard` | `bots`, `executions` (count), `activity_logs` | none |
| `/bots`, `/bots/[id]`, `/bots/new` | `bots`, `bot_commands`, `bot_responses` | via `/api/v1/bots/*` (`bots`, `bot_credentials`, `bot_commands`) |
| `/bots/templates` | `templates` | none |
| `/agents` | `agents` + newest `workflows` row | `/workflows/[id]` editor |
| `/executions` | `executions` + `bots(name)` | server only (workflow engine) |
| `/analytics` | `executions` (last 7 days, aggregated in the service) | none |
| `/integrations` | `bots` | none |
| `/settings/profile` | token claims | `profiles.display_name`, `profiles.avatar_path`, auth metadata, Storage `avatars` |
| `/settings/workspace` | `workspaces`, `workspace_members`, `profiles` | `workspaces` (name, description, `logo_path`), Storage `workspace-logos` |
| `/settings/preferences` | `user_settings` where `key = 'preferences'` | same row (upsert) |
| `/settings/notifications` | `user_settings` where `key = 'notifications'` | same row (upsert) |
| `/settings/security` | Auth session | `auth.updateUser({ password })`, `auth.signOut({ scope: 'others' })`, `auth.reauthenticate()` (verification mail), `DELETE /api/v1/settings/account` (`admin.auth.admin.deleteUser`, bot/storage cleanup, `send-account-deleted` mail) |
| `/settings/api-keys`, `/settings/billing` | none (Coming Soon previews) | none |
| `/knowledge-base`, Playground and bot Knowledge tab | `kb_collections`, `kb_documents`, `kb_bot_links` | same tables, `kb_chunks` (service role), private Storage bucket `knowledge`. See `docs/KNOWLEDGE_BASE.md` |

Service code: `backend/src/server/services/{dashboard,workspace-data,session}.ts`.

## File uploads

Component: `frontend/src/components/ui/file-upload.tsx` (styles `.dz-*` in `globals.css`). It validates type and size, center-crops to a square, resizes to WebP in the browser, shows a live preview with an upload ring, and supports drag and drop and keyboard use.

| Bucket | Object path | Who can write | Stored in |
| --- | --- | --- | --- |
| `avatars` (public read) | `<user_id>/avatar-<timestamp>.webp` | the user, own folder only | `profiles.avatar_path` and auth metadata `avatar_path` (so the header needs no database call) |
| `workspace-logos` (public read) | `<workspace_id>/logo-<timestamp>.webp` | workspace owners and admins | `workspaces.logo_path` |

Both buckets cap files at 2 MB and allow WebP, PNG and JPEG. Policies are in `supabase/migrations/20260101000200_settings_storage.sql`. Replacing or removing an image deletes the previous object.

## Apply the migration

```bash
supabase link --project-ref <ref>
supabase db push
```

## Google sign-in

1. Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID (Web application).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Put the client ID and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. Supabase redirect allow list must include `<app url>/auth/callback` (the script below sets it).

The login and signup pages call `signInWithOAuth({ provider: 'google' })`; `/auth/callback` exchanges the code for a session. The `handle_new_user` trigger creates the profile and workspace from Google's `full_name`.

## Brevo SMTP

1. Brevo > SMTP & API > SMTP: copy the SMTP login (looks like `xxxx@smtp-brevo.com`) and create an SMTP key.
2. Brevo > Senders: verify the sender address (`MAIL_FROM_ADDRESS`) and authenticate your domain (SPF, DKIM, DMARC).
3. Turn off Brevo link and open tracking for transactional mail; tracking rewrites the auth links and breaks them.

Settings used: host `smtp-relay.brevo.com`, port `587`.

## Email templates

Ten branded HTML files live in `supabase/templates/`: `confirmation`, `invite`, `magic_link`, `email_change`, `reset_password` (also written as `recovery` for Supabase Auth's Management API key), `reauthentication` (used before sensitive actions including account deletion), `password_changed`, `email_changed`, and `account_deleted`. They are generated from one cross-client Aurora dark layout (Outlook MSO/VML tables & buttons, Gmail-safe inline CSS, Apple Mail/Yahoo dark mode support, and email-only Help & Support):

```bash
pnpm emails:logo   # creates public Supabase Storage bucket `brand` and uploads logo-icon-128.png
pnpm emails        # regenerate supabase/templates/*.html using the public Supabase Storage logo URL
```

The header logo loads from `<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/brand/logo-icon-128.png` (uploaded via `pnpm emails:logo`, with `EMAIL_LOGO_URL` / `EMAIL_ASSET_URL` optional overrides) because Gmail and Outlook block `data:image/` base64 URIs, so the logo renders both in Supabase Dashboard Preview and in every real inbox.

## Push the configuration to the hosted project

Add the variables from `.env.example` ("Auth setup") to `.env`, then:

```bash
pnpm auth:config                               # dry run, secrets masked
node --env-file=.env scripts/apply-auth-config.mjs --apply
```

It sets the site URL, redirect list, Brevo SMTP, Google provider, the six core Supabase Auth templates (including updated `reauthentication.html`), and enables the two security notifications (`password_changed`, `email_changed`). The notification emails also need "Security notifications" enabled for the project in the dashboard if your plan gates them.

### Account deletion confirmation email (`account_deleted.html`)

Because Supabase Auth does not emit a built-in email when `admin.auth.admin.deleteUser()` deletes an account, RelayNest renders `accountDeletedEmail` (`backend/src/server/email/templates.ts`, matching `supabase/templates/account_deleted.html`) and sends it automatically after deletion:

1. **Primary (Supabase Edge Function):** Deploy [`supabase/functions/send-account-deleted/index.ts`](../supabase/functions/send-account-deleted/index.ts) and configure `BREVO_API_KEY` (or `RESEND_API_KEY`), `MAIL_FROM_ADDRESS`, and `MAIL_FROM_NAME` in Supabase Edge Function secrets:
   ```bash
   supabase functions deploy send-account-deleted
   supabase secrets set BREVO_API_KEY=... MAIL_FROM_ADDRESS=noreply@yourdomain.com MAIL_FROM_NAME=RelayNest
   ```
2. **Automatic Fallback:** If the Edge Function is not deployed yet, `backend/src/server/services/account.ts` falls back to `sendEmail()` in `backend/src/server/email/mailer.ts` using your server `BREVO_API_KEY` + `MAIL_FROM_ADDRESS`.

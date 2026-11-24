# RelayNest GIGW, WCAG 2.1 AA & VA/CA Security Guidelines

> **Mandatory Standard for All Current and Future RelayNest Development**
> Every pull request, UI screen, API route, database migration, and documentation update MUST comply with the rules below and pass `pnpm audit:compliance` before merge or deployment.

---

## 1. Scope & Governance

RelayNest adheres to three unified compliance pillars:
1. **GIGW (Guidelines for Indian Government Websites / Public SaaS Standards)** — clear citizen/user policies, predictable navigation, versioned documentation, support contact transparency, and device-independent access.
2. **WCAG 2.1 Level AA (Accessibility)** — Perceivable, Operable, Understandable, and Robust UI across mouse, keyboard, and assistive technology.
3. **VA / CA (Vulnerability Assessment & Code Audit)** — OWASP ASVS / defense-in-depth protections across HTTP headers, Supabase RLS, encryption, SSRF defense, input validation, and secret isolation.

---

## 2. GIGW Compliance Checklist (Current & Future Pages)

Every public and authenticated layout MUST preserve:
- **Mandatory Policy & Help Pages**: Privacy Policy (`/privacy`), Terms of Service (`/terms`), Terms of Use (`/terms-of-use`), Website Policy (`/website-policy`), Disclaimer (`/disclaimer`), Responsible AI (`/responsible-ai`), Feedback (`/feedback`), Contact Us (`/contact`), About (`/about`), User Documentation (`/docs`), Public API Overview (`/api-reference`), In-App Swagger UI (`/api-docs`), Compliance Guidelines (`/compliance`).
- **Footer Integrity**:
  - **Marketing Footer**: Displays current version badge (`APP_VERSION_TAG`, synced from `package.json` via `frontend/next.config.ts`), Support Email (`ishanrock1234@gmail.com`), Support Phone (`+91 7021133070`), GitHub repository link, and direct links to all legal & compliance pages (`LEGAL_STRIP_LINKS`).
  - **Authenticated App Shell Footer**: Sticky compact bottom bar displaying version badge (`APP_VERSION_TAG`), Documentation link, system health status, and clean policy redirection links (`LEGAL_STRIP_LINKS`, including GIGW & Accessibility -> `/compliance`) without repeating support contact blocks in-app.
- **Release & Documentation Sync**:
  - Documentation (`frontend/src/data/docs-versions.ts`) reads `APP_VERSION` from `frontend/src/lib/app-version.ts` (backed by `frontend/next.config.ts` `NEXT_PUBLIC_APP_VERSION`). Archived versions stay immutable when releasing a new version, and `GIGW, Accessibility & Security Standards` sits cleanly under the final `Compliance` group in `/docs`.
- **Readable Structure & Print/Zoom Tolerance**:
  - Single logical `<h1>` per route, ordered heading hierarchy (`h1 -> h2 -> h3`), zero horizontal overflow at `320px` width or `200%` zoom, and meaningful page `<title>` metadata.

---

## 3. WCAG 2.1 Level AA Rules (Mandatory for All UI Components)

1. **Document Language & Landmarks**:
   - Root layout sets `<html lang="en">`.
   - Every shell renders a visible-on-focus Skip-to-Content link (`href="#main"`), `<header>`, `<nav aria-label="...">`, `<main id="main" tabIndex={-1}>`, and `<footer>`.
2. **Keyboard Navigation & Focus Management**:
   - All interactive controls (buttons, dropdown menus, tabs, Swagger UI accordions, video player, fullscreen modal, sliders) MUST be 100% operable via keyboard alone (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, and arrow keys where appropriate).
   - Modal dialogs MUST set `role="dialog" aria-modal="true"`, trap focus within the dialog while open, close on `Escape`, and restore focus to the triggering element on close.
   - Never strip `:focus-visible` outlines (`globals.css` enforces crisp high-contrast focus rings).
3. **Screen Reader Semantics & Live Announcements**:
   - Every `<img>` and `<Image>` MUST provide descriptive `alt` copy (or `alt=""` with `aria-hidden` for purely decorative visuals).
   - Icon-only buttons MUST declare `aria-label`.
   - Dynamic state updates (scroll-spy section switches, copied API keys, toast feedback, webhook test responses) MUST announce cleanly via `aria-live="polite"` or `role="status"`.
4. **Contrast, Target Size & Motion Sensitivity**:
   - Minimum `4.5:1` contrast for normal text and `3:1` for large text / interactive boundaries in both Dark and Light themes.
   - Respect `prefers-reduced-motion: reduce` and RelayNest's `Reduced Motion` user preference.
   - Dead `href="#"` placeholders are forbidden.

---

## 4. VA / CA Security Requirements (Zero-Trust Architecture)

1. **Strict HTTP Security Headers (`frontend/next.config.ts`)**:
   - `poweredByHeader: false`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `Content-Security-Policy` blocking `object-src 'none'`, `frame-ancestors 'none'`, and disallowing `'unsafe-eval'` in production.
2. **Database Isolation & Least Privilege (Supabase PostgreSQL)**:
   - Enable Row Level Security (`enable row level security`) on **every** table in `public`.
   - Scope tenant access strictly via `public.is_workspace_member(workspace_id, ...)` / `auth.uid()`.
   - Never grant `SELECT *` on tables holding hashed or encrypted credentials (`bot_credentials`, `api_keys.key_hash`, `webhook_endpoints.secret_hash`, `integrations.encrypted_config`). Use explicit column-level grants or server-only queries.
3. **API Keys, Webhooks & Secrets Hygiene**:
   - Plaintext API keys (`rnk_live_...`, `rnk_test_...`) and webhook signing secrets are shown **once at creation/rotation** and stored strictly as SHA-256 hashes (`sha256Hex`).
   - Outbound integration credentials and Telegram bot tokens MUST be encrypted at rest using AES-256-GCM (`encryptSecret`).
   - Use constant-time comparison (`safeEqual`) for all secret and HMAC signature checks.
   - Never call `eval`, `new Function`, `.innerHTML =`, or unreviewed `dangerouslySetInnerHTML`.
   - External links using `target="_blank"` MUST set `rel="noopener noreferrer"` (CWE-1022 protection).
4. **SSRF, Validation & Input Bounds**:
   - Every external webhook/callback URL MUST pass `assertSafeOutboundUrl()` (HTTPS only, ports `443`/`8443`, blocks loopback, RFC 1918 private ranges, link-local metadata endpoints `169.254.169.254`, IPv6 ULA/link-local, numeric IPv4 aliases, and credentials in URLs).
   - Validate all route JSON/query payloads with Zod (`readJson` with explicit byte limits) and return uniform error envelopes without stack traces.

---

## 5. Automated CI/CD Gate & Future PR Workflow

Before opening or merging any PR:
1. Run `pnpm audit:compliance` (executes `scripts/security-a11y-audit.mjs` — enforced in `.github/workflows/ci.yml` BEFORE `lint`, `typecheck`, `test`, and `build`).
2. Run `pnpm lint && pnpm typecheck && pnpm test`.
3. Verify keyboard-only traversal (`Tab` + `Enter` + `Escape`) and Light/Dark theme contrast on any new or edited UI route.
4. Confirm any new Supabase migration enables RLS, defines tenant policies, and grants only non-secret columns to `authenticated`.

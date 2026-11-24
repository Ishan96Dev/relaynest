# Contributing to RelayNest

Thanks for helping improve RelayNest. This guide keeps changes easy to review.

## Setup

1. Install Node 22+ and pnpm 10+ (`corepack enable`).
2. Run `pnpm install`, copy `.env.example` to `.env`, then start the app (`pnpm dev`, or `pnpm dev:demo` without credentials).
3. Read [docs/VIBE_CODING_GUIDE.md](docs/VIBE_CODING_GUIDE.md) for the engineering rules.

## Workflow

- Branch from `main`: `feature/<short-name>` or `fix/<short-name>`.
- Keep pull requests small and focused on one vertical slice.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Before opening a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four must pass; CI runs the same checks.

## Standards

- TypeScript strict. Validate every external input with Zod.
- Authorize on the server for every workspace-owned resource. RLS is defence in depth, not a replacement.
- Never log or return secrets (bot tokens, encryption keys, authorization headers).
- Add tests for business logic and security-sensitive paths.
- UI: use the shared components in `frontend/src/components/ui`, semantic colour tokens (no hard-coded hex), and check dark mode, light mode and a 390px viewport. Provide loading, empty, error and success states.
- AI features stay **Coming Soon** and must not imply a working integration.
- Schema changes go in a new file under `supabase/migrations`; never edit an applied migration.

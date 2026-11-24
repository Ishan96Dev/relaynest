## What and why

<!-- What does this change do, and why? Link the issue. -->

## Screenshots (UI changes)

<!-- Dark and light mode, desktop and mobile. -->

## Checklist

- [ ] lint, typecheck, test and build pass
- [ ] `pnpm audit:compliance` (GIGW, WCAG 2.1 AA, VA/CA) passes with 0 issues
- [ ] Keyboard navigation (`Tab`, `Enter`, `Escape`), skip links, `alt` copy, and Light/Dark contrast verified (`docs/GIGW_VACA_ACCESSIBILITY.md`)
- [ ] Inputs validated with Zod, workspace RLS & column grants enforced, SSRF/secret hygiene preserved
- [ ] Loading, empty, error and success states handled
- [ ] Docs and migrations updated if needed
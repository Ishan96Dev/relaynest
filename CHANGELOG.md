# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [Unreleased]
### Added
- Knowledge Base (RAG): collections of PDF, TXT, Markdown and web page sources, shared with rule-based bots, AI bots, AI agent bots and the Model Playground. Chunks live in Supabase; embeddings go to Milvus when `MILVUS_URI` is set, with Postgres full-text search as the fallback. See `docs/KNOWLEDGE_BASE.md`.

### Changed
- Faster navigation: token checks verified locally (`getClaims`), no database calls in the layout, middleware limited to protected pages, parallel dashboard queries, instant sign-out.
- Auth screens fit the window, with a clickable brand, a log in / sign up switch and a richer panel.
- Pricing page, animated rainbow headlines with word-by-word and scroll-driven text reveals, full favicon set.

### Fixed
- Text typed into inputs was invisible: global base styles now live in a CSS layer so utilities win.

### Added
- Next.js frontend: marketing site, auth, dashboard, bots, templates, workflow editor, analytics and settings.
- Backend modules: encrypted Telegram credentials, webhook receiver, workflow validator and executor, SSRF guard.
- Supabase schema with RLS and workspace bootstrap on signup.
- Light and dark themes, custom form components, tooltips, modals and motion effects.
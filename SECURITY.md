# Security Policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Report a vulnerability** (Security tab, private advisory)
on this repository. Include steps to reproduce, impact and affected versions. You will get an initial
response within 5 business days.

## Scope notes

- Bot tokens are encrypted with AES-256-GCM and are never returned to the browser.
- Telegram webhooks are verified with a per-bot secret token and de-duplicated by `update_id`.
- Outbound HTTP actions block private, loopback and link-local addresses (SSRF guard).
- Every tenant table has row-level security enabled.

See [docs/SECURITY.md](docs/SECURITY.md) for the full requirements.

## Supported versions

Only the latest `main` is supported until the first tagged release.
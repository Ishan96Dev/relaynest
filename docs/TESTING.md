# Testing Strategy

## 1. Test layers

- Unit tests: domain services, validators, workflow graph traversal,
  encryption helpers.
- Integration tests: Supabase repositories, Telegram adapter, webhook
  handler.
- RLS tests: tenant isolation and role permissions.
- Component tests: forms, dialogs, status indicators, workflow editor
  controls.
- End-to-end tests: sign-up, bot setup, workflow creation, execution
  history.
- Runtime tests: Cloudflare-compatible build and deployment preview.

## 2. Critical test cases

### Authentication

- Signup success.
- Duplicate email.
- Login success/failure.
- Password reset.
- Unauthenticated protected route.
- Expired/invalid session.

### Tenant isolation

- Workspace A cannot read Workspace B bots.
- Workspace A cannot update Workspace B agents.
- Viewer cannot perform admin-only actions.
- A guessed resource ID does not bypass authorization.

### Bot integration

- Valid Telegram token.
- Invalid Telegram token.
- Telegram API timeout.
- Token is encrypted before persistence.
- API response never contains token.
- Webhook secret valid/invalid.
- Duplicate update ID.
- Bot inactive.
- `/start` welcome response.
- Default response fallback.

### Workflow engine

- Valid graph.
- Unknown node type.
- Invalid node config.
- Missing edge endpoint.
- Unsupported cycle.
- Condition true/false branches.
- Action timeout.
- Transient retry.
- Permanent error not retried.
- Execution records correct workflow version.
- Idempotency prevents duplicate side effects where supported.

### Security

- SSRF blocked for private and metadata IPs.
- Oversized webhook rejected.
- Rate limit enforced.
- Secret redaction in logs.
- Cross-workspace integration reference rejected.

## 3. Test data

Use dedicated test workspaces and test Telegram bots. Never use
production tokens in CI.

## 4. CI quality gates

Required before merge: - Lint passes. - Typecheck passes. - Unit tests
pass. - Integration tests pass where configured. - Build passes. -
Migration review completed.

## 5. Definition of done

A feature is done only when: - Acceptance criteria met. - Validation and
authorization implemented. - Loading, empty, success, and error states
implemented. - Tests added and passing. - Documentation updated. - No
secrets exposed. - No unresolved critical security issue.

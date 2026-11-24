# Security Requirements

## 1. Threat model

Protect: - User accounts and sessions. - Workspace data. - Telegram bot
tokens. - Webhook secrets. - Integration credentials. - Uploaded
files. - Workflow execution infrastructure.

Assume that clients can manipulate all browser requests and that webhook
requests may be forged or replayed.

## 2. Authentication and authorization

- Use Supabase Auth.
- Verify sessions server-side.
- Check workspace membership for every tenant-owned resource.
- Use role-aware permissions.
- Never trust a user ID or workspace ID supplied by the client without
  verification.
- Do not use user-editable metadata for authorization.
- Revoke or refresh sessions appropriately after sensitive account
  changes.

## 3. Database security

- Enable RLS on all exposed tables.
- Scope policies to workspace membership.
- Include both `USING` and `WITH CHECK` for updates.
- Protect privileged tables such as credentials.
- Avoid unsafe `SECURITY DEFINER` functions.
- Review views because views can bypass RLS by default unless configured
  appropriately.
- Confirm Data API grants as well as RLS.

## 4. Secret management

- Never expose Supabase secret/service-role key to browser.
- Never expose Telegram bot tokens.
- Encrypt integration credentials with authenticated encryption.
- Keep encryption keys in Cloudflare Worker Secrets.
- Store key version metadata.
- Plan key rotation.
- Mask secrets in UI.
- Redact secrets from logs and errors.

## 5. Webhook security

Telegram: - Validate `X-Telegram-Bot-Api-Secret-Token`. - Use unique,
unpredictable secrets. - Deduplicate update IDs. - Validate request
method, content type, and payload. - Limit payload size. - Rate-limit
suspicious traffic.

Generic incoming webhooks: - Use high-entropy secrets or signature
verification. - Store only a hash where practical. - Support rotation. -
Avoid leaking secret validity in detailed error messages.

## 6. Workflow execution security

- No arbitrary code execution.
- Validate node schemas.
- Limit graph size and execution time.
- Limit outbound requests.
- Protect against SSRF.
- Block internal, loopback, link-local, and metadata addresses.
- Revalidate redirects and DNS resolution.
- Apply rate limits per workspace.
- Prevent cross-workspace bot/integration references.
- Bound retries and concurrency.

## 7. File upload security

- Enforce file size and MIME/type limits.
- Do not trust client-provided content type.
- Use private buckets by default.
- Generate signed URLs where appropriate.
- Scan or safely process files before future document ingestion.
- Do not implement executable file processing in the MVP.

## 8. Abuse prevention

- Bot creation and message quotas.
- Workflow execution quotas.
- Per-user and per-workspace rate limits.
- Outbound message safeguards.
- Admin suspension controls.
- Audit events for credential changes and workflow activation.
- Clear acceptable-use policy.

## 9. Privacy

- Collect only required data.
- Define retention periods for execution logs.
- Avoid storing full Telegram message contents unless required for the
  feature.
- Provide account and workspace data deletion procedures.
- Publish privacy policy before public launch.

## 10. Security release checklist

- [ ] RLS enabled and tested.
- [ ] Cross-tenant access tests pass.
- [ ] Secrets absent from client bundles.
- [ ] Tokens encrypted at rest.
- [ ] Webhook secrets verified.
- [ ] Duplicate webhook events handled.
- [ ] SSRF mitigations tested.
- [ ] Rate limits active.
- [ ] Error messages do not leak internals.
- [ ] Logs redact sensitive values.
- [ ] Dependencies audited.
- [ ] Backup and recovery plan documented.

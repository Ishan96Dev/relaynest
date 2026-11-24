# API Specification

## 1. Conventions

Base path: `/api/v1`

All application endpoints require an authenticated session unless
explicitly marked public or webhook-based.

Use JSON. Validate all input. Return stable error codes. Include a
request ID.

### Success envelope

``` json
{
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

### Error envelope

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": []
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

## 2. Authentication & Account Management

Supabase Auth owns registration, login, logout, verification, reauthentication (`auth.reauthenticate()`), and
password reset. Use documented Supabase SSR integration for Next.js
session cookies.

Do not build a second password store.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `DELETE` | `/api/v1/settings/account` | Permanently delete authenticated user account |

Requirements for `DELETE /api/v1/settings/account`:
- Enforces trusted origin (`hasTrustedOrigin`), authenticated session (`requireAuth()`), and rate limit (`5` requests per `10` min window per user/IP).
- Requires JSON body `{ "confirmText": "DELETE" }`.
- Cleans up owned workspace Telegram bots/webhooks (`cleanupTelegramBotOnDelete`), Storage avatars/logos, owned workspaces, profile row, and Supabase Auth user (`admin.auth.admin.deleteUser`).
- Dispatches the branded `account_deleted.html` email via Supabase Edge Function (`send-account-deleted`) or Brevo HTTP API fallback and returns `{ deleted: true, email, deletedWorkspaces, confirmationEmailSent, deliveryChannel }`.

## 3. Workspace endpoints

  ----------------------------------------------------------------------------------------
  Method                  Endpoint                                 Purpose
  ----------------------- ---------------------------------------- -----------------------
  GET                     `/workspaces`                            List accessible
                                                                   workspaces

  POST                    `/workspaces`                            Create workspace

  GET                     `/workspaces/:workspaceId`               Get workspace

  PATCH                   `/workspaces/:workspaceId`               Update workspace

  GET                     `/workspaces/:workspaceId/members`       List members

  POST                    `/workspaces/:workspaceId/invitations`   Invite member (later)
  ----------------------------------------------------------------------------------------

Every endpoint must verify membership and role.

## 4. Bot endpoints

  Method   Endpoint                             Purpose
  -------- ------------------------------------ ------------------------------
  GET      `/bots`                              List workspace bots
  POST     `/bots`                              Create bot draft
  GET      `/bots/:botId`                       Get bot safe DTO
  PATCH    `/bots/:botId`                       Update bot
  DELETE   `/bots/:botId`                       Delete bot
  POST     `/bots/:botId/validate-token`        Validate token with Telegram
  POST     `/bots/:botId/webhook/register`      Register Telegram webhook
  POST     `/bots/:botId/webhook/remove`        Remove webhook
  POST     `/bots/:botId/activate`              Activate bot
  POST     `/bots/:botId/deactivate`            Deactivate bot
  GET      `/bots/:botId/commands`              List commands
  POST     `/bots/:botId/commands`              Create command
  PATCH    `/bots/:botId/commands/:commandId`   Update command
  DELETE   `/bots/:botId/commands/:commandId`   Delete command
  GET      `/bots/:botId/responses`             List response rules
  POST     `/bots/:botId/responses`             Create response rule

Never include raw tokens in response DTOs. Token validation responses
should return only bot ID, username, display name, and validation
status.

## 5. Agent and workflow endpoints

  Method   Endpoint                              Purpose
  -------- ------------------------------------- -------------------------
  GET      `/agents`                             List agents
  POST     `/agents`                             Create agent
  GET      `/agents/:agentId`                    Get agent
  PATCH    `/agents/:agentId`                    Update agent
  DELETE   `/agents/:agentId`                    Delete agent
  GET      `/agents/:agentId/workflows`          List workflows
  POST     `/agents/:agentId/workflows`          Create workflow
  GET      `/workflows/:workflowId`              Get workflow definition
  PUT      `/workflows/:workflowId/draft`        Save draft graph
  POST     `/workflows/:workflowId/validate`     Validate graph
  POST     `/workflows/:workflowId/test`         Run test execution
  POST     `/workflows/:workflowId/publish`      Publish a version
  POST     `/workflows/:workflowId/activate`     Activate
  POST     `/workflows/:workflowId/deactivate`   Deactivate

## 6. Execution endpoints

  Method   Endpoint                           Purpose
  -------- ---------------------------------- --------------------------
  GET      `/executions`                      List executions
  GET      `/executions/:executionId`         Execution details
  GET      `/executions/:executionId/steps`   Step details
  POST     `/executions/:executionId/retry`   Retry eligible execution

Retry must verify ownership, retry eligibility, attempt limits, and
idempotency.

## 7. Telegram webhook endpoint

`POST /api/webhooks/telegram/:botPublicId`

This endpoint is called by Telegram and does not use a browser session.

Requirements: - Validate `X-Telegram-Bot-Api-Secret-Token`. - Resolve
the bot without exposing internal credentials. - Validate payload
shape. - Deduplicate by Telegram `update_id`. - Persist or enqueue the
event. - Respond promptly. - Do not log the token or full sensitive
payload. - Apply abuse controls.

## 8. Generic workflow webhook endpoint

`POST /api/webhooks/incoming/:publicId`

Requirements: - Resolve endpoint. - Verify shared secret or signature. -
Enforce request size and rate limits. - Validate configured payload
schema if present. - Deduplicate when caller supplies an event ID. -
Start a workflow execution. - Return an accepted response when
processing is asynchronous.

## 9. Status codes

- `200` successful read/update/action.
- `201` resource created.
- `202` accepted for asynchronous processing.
- `204` successful delete with no body.
- `400` malformed request.
- `401` unauthenticated or invalid webhook credential.
- `403` authenticated but unauthorized.
- `404` resource not found or intentionally concealed.
- `409` conflict or duplicate operation.
- `422` valid JSON but invalid domain configuration.
- `429` rate limit.
- `500` unexpected server failure.
- `502` upstream provider failure where appropriate.

## 10. Pagination

Use cursor pagination for execution history and large lists.

Example query: `?limit=25&cursor=<opaque-cursor>`

Return:

``` json
{
  "data": [],
  "meta": {
    "nextCursor": "opaque-cursor",
    "hasMore": true
  }
}
```

## 11. API security

- Require authentication for dashboard APIs.
- Check workspace membership on every tenant resource.
- Validate all input.
- Rate-limit sensitive endpoints.
- Use CSRF protections appropriate to cookie-based auth.
- Avoid open redirects.
- Restrict outbound HTTP actions to mitigate SSRF.
- Do not permit arbitrary internal IP access through HTTP request nodes.
- Do not reveal whether a secret or token exists through verbose errors.

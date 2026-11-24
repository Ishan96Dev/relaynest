export const API_SCOPE_META = [
  { id: "bots:read", label: "Bots · Read", description: "List bots, check live Telegram status, and inspect bot history." },
  { id: "bots:write", label: "Bots · Write", description: "Create, update, sync, pause, activate, test, or delete bots." },
  { id: "workflows:read", label: "Automations · Read", description: "List workflows and inspect automation execution runs." },
  { id: "workflows:write", label: "Automations · Write", description: "Create, edit, publish, pause, and trigger workflows." },
  { id: "integrations:read", label: "Integrations · Read", description: "Inspect Telegram connections, webhooks, and channel targets." },
  { id: "integrations:write", label: "Integrations · Write", description: "Create, configure, test, rotate, or delete integrations & webhooks." },
  { id: "analytics:read", label: "Analytics · Read", description: "Read workspace execution counts, bot metrics, and AI token telemetry." },
  { id: "notifications:read", label: "Notifications · Read & Ack", description: "Fetch workspace notifications and mark alerts as read." },
] as const;

export type ApiScope = (typeof API_SCOPE_META)[number]["id"];
export const ALL_API_SCOPES = API_SCOPE_META.map((s) => s.id) as [ApiScope, ...ApiScope[]];

export const INTEGRATION_EVENT_META = [
  { id: "bot.created", label: "Bot Created" },
  { id: "bot.deleted", label: "Bot Deleted / Telegram Synced" },
  { id: "automation.published", label: "Automation Published" },
  { id: "execution.failed", label: "Execution Failed" },
  { id: "api_key.created", label: "API Key Created / Revoked" },
  { id: "integration.tested", label: "Integration Test Ping" },
] as const;

export type IntegrationEvent = (typeof INTEGRATION_EVENT_META)[number]["id"];

export interface OpenApiParam {
  name: string;
  in: "path" | "query";
  required: boolean;
  description: string;
  schema: { type: string; enum?: string[]; default?: string | number };
}

export interface OpenApiOperation {
  summary: string;
  description: string;
  tags: string[];
  requiredScope?: ApiScope | "session-only" | "public";
  parameters?: OpenApiParam[];
  requestBodyExample?: Record<string, unknown>;
  sampleResponse: Record<string, unknown>;
}

export function buildOpenApiSpec(serverUrl = "https://relaynest.app") {
  return {
    openapi: "3.1.0",
    info: {
      title: "RelayNest Workspace & Automation REST API",
      version: "0.1.0",
      description:
        "Programmatic REST API and Webhook interface for RelayNest Telegram Bots, Visual Automations, Outbound Integrations, Notifications, and Workspace Analytics. Authenticate requests with a workspace API key generated under Settings -> API Keys.",
      contact: { name: "RelayNest Support", email: "ishanrock1234@gmail.com" },
    },
    servers: [
      { url: serverUrl, description: "Active RelayNest Workspace Server" },
    ],
    security: [{ BearerApiKey: [] }],
    tags: [
      { name: "Bots", description: "Telegram bot lifecycle, two-way Telegram sync, testing, and deleted history." },
      { name: "Automations", description: "Visual workflows, execution runs, and signed incoming webhook triggers." },
      { name: "Integrations", description: "Slack, Discord, custom signed outbound webhooks, and incoming webhook endpoints." },
      { name: "API Keys", description: "Create, rotate, revoke, and audit workspace API credentials." },
      { name: "Analytics", description: "Workspace execution totals, bot message stats, and AI token telemetry." },
      { name: "Notifications", description: "Read workspace notifications and mark alerts as read." },
      { name: "System", description: "Health check and platform specification endpoints." },
    ],
    components: {
      securitySchemes: {
        BearerApiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "RelayNest API Key (rnk_live_... or rnk_test_...)",
          description: "Generate keys in Dashboard -> Settings -> API Keys. Pass as `Authorization: Bearer <token>` or `X-RelayNest-API-Key: <token>`.",
        },
      },
      schemas: {
        ErrorEnvelope: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "UNAUTHENTICATED" },
                message: { type: "string", example: "Authentication is required." },
              },
            },
            meta: { type: "object", properties: { requestId: { type: "string" } } },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          tags: ["System"],
          summary: "Platform health probe",
          description: "Returns service readiness without requiring authentication.",
          security: [],
          "x-sample-response": { status: "ok", timestamp: "2026-11-24T12:00:00.000Z" },
          responses: { "200": { description: "Healthy" } },
        },
      },
      "/api/v1/bots": {
        get: {
          tags: ["Bots"],
          summary: "List workspace Telegram bots",
          description: "Returns bots belonging to the authenticated workspace along with webhook status and message counters.",
          "x-scope": "bots:read",
          parameters: [
            { name: "limit", in: "query", required: false, description: "Max bots per page (1-100)", schema: { type: "integer", default: 25 } },
            { name: "status", in: "query", required: false, description: "Optional status filter", schema: { type: "string", enum: ["draft", "active", "inactive", "error"] } },
          ],
          "x-sample-response": { data: [{ id: "uuid", name: "SupportBot", username: "support_bot", status: "active", messagesCount: 142 }], meta: { requestId: "req_123" } },
          responses: { "200": { description: "List of workspace bots" }, "401": { description: "Invalid or missing API key" } },
        },
        post: {
          tags: ["Bots"],
          summary: "Connect a new Telegram bot",
          description: "Validates a @BotFather token against Telegram Bot API, encrypts it with AES-256-GCM, and saves the bot to Supabase.",
          "x-scope": "bots:write",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                example: { name: "Order Updates Bot", category: "E-commerce", description: "Sends live shipping updates", token: "1234567890:AAExampleBotFatherTokenHere" },
              },
            },
          },
          "x-sample-response": { data: { id: "uuid", name: "Order Updates Bot", status: "draft" }, meta: { requestId: "req_123" } },
          responses: { "201": { description: "Bot connected" }, "400": { description: "Validation error" } },
        },
      },
      "/api/v1/bots/{botId}": {
        get: {
          tags: ["Bots"],
          summary: "Get single bot details",
          description: "Fetch safe metadata for a specific bot ID in your workspace.",
          "x-scope": "bots:read",
          parameters: [{ name: "botId", in: "path", required: true, description: "Bot UUID", schema: { type: "string" } }],
          "x-sample-response": { data: { id: "uuid", name: "SupportBot", status: "active" }, meta: { requestId: "req_123" } },
          responses: { "200": { description: "Bot details" }, "404": { description: "Bot not found" } },
        },
        patch: {
          tags: ["Bots"],
          summary: "Update bot configuration",
          description: "Updates bot display name, description, welcome greeting, fallback reply, or status and syncs two-way with Telegram.",
          "x-scope": "bots:write",
          parameters: [{ name: "botId", in: "path", required: true, description: "Bot UUID", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { example: { name: "Updated Bot Name", description: "Updated support assistant" } } } },
          "x-sample-response": { data: { id: "uuid", name: "Updated Bot Name", status: "active" } },
          responses: { "200": { description: "Bot updated" } },
        },
        delete: {
          tags: ["Bots"],
          summary: "Delete bot from RelayNest & Telegram",
          description: "Clears commands, descriptions, and webhook on Telegram, archives configuration snapshot into Bot History, and removes the bot.",
          "x-scope": "bots:write",
          parameters: [{ name: "botId", in: "path", required: true, description: "Bot UUID", schema: { type: "string" } }],
          "x-sample-response": { status: 204 },
          responses: { "204": { description: "Deleted cleanly" } },
        },
      },
      "/api/v1/bots/sync": {
        post: {
          tags: ["Bots"],
          summary: "Two-way Telegram status sync",
          description: "Checks every connected bot against Telegram getMe and flags bots removed or revoked directly inside Telegram.",
          "x-scope": "bots:write",
          "x-sample-response": { data: { checked: 2, active: 2, deletedOnTelegram: [] } },
          responses: { "200": { description: "Sync summary" } },
        },
      },
      "/api/v1/bots/history": {
        get: {
          tags: ["Bots"],
          summary: "List bot lifecycle & deletion audit history",
          description: "Returns created, user-deleted, and Telegram-deleted bot history entries with saved command/model configuration snapshots.",
          "x-scope": "bots:read",
          "x-sample-response": { data: { items: [{ id: "uuid", botName: "SupportBot", event: "created", occurredAt: "2026-11-24T10:00:00Z" }] } },
          responses: { "200": { description: "History records" } },
        },
      },
      "/api/v1/automations": {
        get: {
          tags: ["Automations"],
          summary: "List workspace automations",
          description: "Returns workflows with status, version, schedule, and incoming webhook status.",
          "x-scope": "workflows:read",
          "x-sample-response": { data: [{ id: "uuid", name: "Welcome Onboarding", status: "active", version: 2 }] },
          responses: { "200": { description: "Automations list" } },
        },
      },
      "/api/v1/executions": {
        get: {
          tags: ["Automations"],
          summary: "List automation execution logs",
          description: "Fetches recent workflow runs, trigger sources, durations, and statuses.",
          "x-scope": "workflows:read",
          parameters: [{ name: "limit", in: "query", required: false, description: "Max executions (1-100)", schema: { type: "integer", default: 25 } }],
          "x-sample-response": { data: [{ id: "uuid", trigger_type: "webhook", status: "succeeded", duration_ms: 148 }] },
          responses: { "200": { description: "Executions list" } },
        },
      },
      "/api/webhooks/workflows/{publicId}": {
        post: {
          tags: ["Automations"],
          summary: "Trigger published workflow via incoming webhook",
          description: "Send any JSON payload with header `X-RelayNest-Secret: <secret>` (or Bearer token) and optional `Idempotency-Key` header.",
          security: [],
          parameters: [{ name: "publicId", in: "path", required: true, description: "24-char hex webhook publicId", schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { example: { orderId: "ORD-9021", customer: "Aarav", amount: 749 } } } },
          "x-sample-response": { data: { status: "succeeded", executionId: "uuid" } },
          responses: { "200": { description: "Workflow executed" }, "401": { description: "Invalid webhook secret" } },
        },
      },
      "/api/v1/integrations": {
        get: {
          tags: ["Integrations"],
          summary: "List Telegram, Incoming Webhooks, and External Channel Integrations",
          description: "Returns all connected bots, workflow webhook endpoints, and outbound Slack/Discord/Webhook targets stored in Supabase.",
          "x-scope": "integrations:read",
          "x-sample-response": { data: { bots: [], webhookEndpoints: [], integrations: [] } },
          responses: { "200": { description: "Integrations payload" } },
        },
        post: {
          tags: ["Integrations"],
          summary: "Create an outbound channel integration (Slack, Discord, or Signed Webhook)",
          description: "Encrypts the destination URL and optional signing secret with AES-256-GCM after verifying SSRF safety.",
          "x-scope": "integrations:write",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                example: { provider: "webhook", name: "CRM Lead Relay", webhookUrl: "https://example.com/hooks/relaynest", events: ["bot.created", "automation.published"] },
              },
            },
          },
          "x-sample-response": { data: { id: "uuid", provider: "webhook", name: "CRM Lead Relay", status: "active" } },
          responses: { "201": { description: "Integration created" } },
        },
      },
      "/api/v1/integrations/{integrationId}/test": {
        post: {
          tags: ["Integrations"],
          summary: "Send a signed test payload to an outbound integration",
          description: "Fires a real HMAC-SHA256 signed HTTPS POST (`X-RelayNest-Signature`) and emits a live workspace notification.",
          "x-scope": "integrations:write",
          parameters: [{ name: "integrationId", in: "path", required: true, description: "Integration UUID", schema: { type: "string" } }],
          "x-sample-response": { data: { delivered: true, statusCode: 200, latencyMs: 112 } },
          responses: { "200": { description: "Test result" } },
        },
      },
      "/api/v1/integrations/webhooks": {
        post: {
          tags: ["Integrations"],
          summary: "Provision an Incoming Webhook endpoint for an automation",
          description: "Generates a 24-char public webhook URL and one-time signing secret linked to a workspace workflow.",
          "x-scope": "integrations:write",
          requestBody: { required: true, content: { "application/json": { example: { workflowId: "00000000-0000-0000-0000-000000000000" } } } },
          "x-sample-response": { data: { id: "uuid", url: "https://relaynest.app/api/webhooks/workflows/...", secret: "one-time-secret" } },
          responses: { "201": { description: "Incoming webhook created" } },
        },
      },
      "/api/v1/analytics": {
        get: {
          tags: ["Analytics"],
          summary: "Get workspace execution, bot & API telemetry",
          description: "Returns 7-day execution volume, success rate, bot message totals, AI tokens/cost, and API call statistics.",
          "x-scope": "analytics:read",
          "x-sample-response": { data: { totals: { bots: 2, activeBots: 1, messages: 120, executions: 24 }, quickStats: { successRate: 100 } } },
          responses: { "200": { description: "Workspace analytics" } },
        },
      },
      "/api/v1/settings/api-keys": {
        get: {
          tags: ["API Keys"],
          summary: "List workspace API keys & request telemetry",
          description: "Returns non-secret API key metadata, 7-day API call volume, and recent API request logs.",
          "x-scope": "session-only",
          "x-sample-response": { data: { keys: [], stats: { total: 2, active: 2, revoked: 0 }, recentLogs: [] } },
          responses: { "200": { description: "API keys summary" } },
        },
        post: {
          tags: ["API Keys"],
          summary: "Create a new workspace API key",
          description: "Generates a scoped `rnk_live_...` or `rnk_test_...` token, stores only its SHA-256 hash in Supabase, and returns the plaintext token once.",
          "x-scope": "session-only",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                example: { name: "Production Backend Sync", environment: "production", scopes: ["bots:read", "workflows:read", "analytics:read"], expiresInDays: 90 },
              },
            },
          },
          "x-sample-response": { data: { key: { id: "uuid", keyPrefix: "rnk_live_a1b2c3d4" }, plaintextToken: "rnk_live_..." } },
          responses: { "201": { description: "API key created" } },
        },
      },
      "/api/v1/notifications": {
        get: {
          tags: ["Notifications"],
          summary: "Fetch workspace notifications & unread count",
          description: "Returns the 20 latest notifications (bots, API keys, integrations, billing, security alerts) and unread count.",
          "x-scope": "notifications:read",
          "x-sample-response": { data: { items: [], unread: 0 } },
          responses: { "200": { description: "Notifications list" } },
        },
        post: {
          tags: ["Notifications"],
          summary: "Mark one or all notifications as read",
          description: "Marks a specific notification UUID or all unread notifications as read.",
          "x-scope": "notifications:read",
          requestBody: { required: true, content: { "application/json": { example: { readAll: true } } } },
          "x-sample-response": { data: { done: true } },
          responses: { "200": { description: "Notifications updated" } },
        },
      },
    },
  };
}

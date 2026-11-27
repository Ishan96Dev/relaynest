/**
 * Shared execution trace types and presentation helpers used by both server services and UI components.
 * Zero server-only imports so client analytics views and modals stay strictly typed.
 */

export type ExecutionTriggerCategory =
  | "command"
  | "ai_chat"
  | "knowledge"
  | "keyword"
  | "default"
  | "workflow"
  | "schedule"
  | "webhook"
  | "manual"
  | "message";

export type ExecutionStepPhase =
  | "intake"
  | "routing"
  | "retrieval"
  | "model"
  | "delivery"
  | "memory"
  | "workflow"
  | "error";

export interface ExecutionStepDto {
  id: string;
  stepOrder: number;
  nodeId: string;
  nodeType: string;
  title: string;
  subtitle: string;
  phase: ExecutionStepPhase;
  status: "succeeded" | "failed" | "skipped" | "running";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  offsetMs: number | null;
  inputSummary: Record<string, unknown> | null;
  outputSummary: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
  inferred?: boolean;
}

export interface ExecutionAiCallDto {
  id: number;
  source: "nvidia" | "vercel";
  modelSlug: string;
  apiModelId: string | null;
  kind: string;
  origin: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number | null;
  providerRequestId: string | null;
  createdAt: string;
}

export interface ExecutionActorDto {
  chatId: string | null;
  chatType: string | null;
  userId: string | null;
  username: string | null;
  firstName: string | null;
  updateId: number | null;
  messageId: number | null;
}

export interface ExecutionPhaseSlice {
  phase: ExecutionStepPhase;
  label: string;
  durationMs: number;
  pct: number;
}

export interface ExecutionSummaryItem {
  id: string;
  botId: string | null;
  botName: string;
  botUsername: string | null;
  workflowId: string | null;
  workflowName: string | null;
  triggerType: string;
  triggerLabel: string;
  triggerCategory: ExecutionTriggerCategory;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  inputPreview: string | null;
  outputPreview: string | null;
  actorLabel: string | null;
  chatId: string | null;
  modelLabel: string | null;
  providerSource: "nvidia" | "vercel" | null;
  totalTokens: number;
  costUsd: number;
  stepCount: number;
  hasRecordedSteps: boolean;
}

export interface ExecutionDetailDto {
  execution: {
    id: string;
    botId: string | null;
    botName: string | null;
    botUsername: string | null;
    agentId: string | null;
    agentName: string | null;
    agentModelName: string | null;
    agentImageModelName: string | null;
    workflowId: string | null;
    workflowName: string | null;
    workflowVersion: number | null;
    triggerType: string;
    triggerLabel: string;
    triggerCategory: ExecutionTriggerCategory;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    idempotencyKey: string | null;
    triggerPayload: Record<string, unknown> | null;
  };
  actor: ExecutionActorDto;
  summary: {
    inputText: string | null;
    outputText: string | null;
    modelUsed: string | null;
    modelSlug: string | null;
    provider: string | null;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    deliveredMessages: number;
    queuedMessages: number;
    telegramMessageIds: number[];
  };
  traceSource: "recorded" | "reconstructed";
  steps: ExecutionStepDto[];
  aiCalls: ExecutionAiCallDto[];
  phaseBreakdown: ExecutionPhaseSlice[];
}

export interface CommandStatRow {
  trigger: string;
  label: string;
  category: ExecutionTriggerCategory;
  count: number;
  succeeded: number;
  failed: number;
  successRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  totalTokens: number;
}

export interface BotModelUsageRow {
  slug: string;
  apiModelId: string | null;
  source: "nvidia" | "vercel";
  kind: string;
  calls: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  avgLatencyMs: number;
  costUsd: number;
}

export interface BotAnalyticsPayload {
  days: number | "all";
  summary: {
    totalExecutions: number;
    periodExecutions: number;
    succeeded: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    messagesCount: number;
    activeUsers: number;
    aiCalls: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    aiCostUsd: number;
  };
  stats: {
    messages: number;
    activeUsers: number;
    executionsTotal: number;
    executionsSucceeded: number;
    executionsFailed: number;
    avgDurationMs: number;
    aiRequests: number;
    aiTokensTotal: number;
  };
  trend: { day: string; value: number }[];
  dailyStatus: { day: string; succeeded: number; failed: number }[];
  byCommand: CommandStatRow[];
  byModel: BotModelUsageRow[];
  executions: ExecutionSummaryItem[];
  workflows: { id: string; name: string; description: string; status: string; updated_at: string }[];
  logs: { id: string; action: string; detail: string | null; created_at: string }[];
  integrations: {
    id: string;
    provider: string;
    name: string;
    status: string;
    events: string[];
    targetPreview: string | null;
    lastTestedAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    createdAt: string;
  }[];
  webhookEndpoints: {
    id: string;
    workflowId: string;
    workflowName: string;
    workflowStatus: string;
    url: string;
    enabled: boolean;
    createdAt: string;
  }[];
  agent: {
    id: string;
    name: string;
    status: string;
    language: string;
    category: string;
    modelName: string | null;
    imageModelName: string | null;
    temperature: number;
    maxTokens: number;
    memoryTurns: number;
    tools: {
      datetime: boolean;
      mentionOnly: boolean;
      typing: boolean;
      matchLanguage: boolean;
      webSearch: boolean;
      autoSearch: boolean;
      marketData: boolean;
    };
    instructions: string;
  } | null;
  agentKnowledge: { id: string; title: string; content: string; createdAt: string }[];
}

/** Parses raw DB `trigger_type` strings (e.g. `command:/imagine`, `ai_message`) into clean display metadata. */
export function parseTriggerInfo(triggerType: string): {
  label: string;
  category: ExecutionTriggerCategory;
  command?: string;
} {
  const raw = String(triggerType || "unknown").trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith("command:")) {
    const cmd = raw.slice("command:".length).trim();
    const normalized = cmd.startsWith("/") ? cmd.toLowerCase() : `/${cmd.toLowerCase()}`;
    return { label: normalized, category: "command", command: normalized.slice(1) };
  }
  if (lower === "ai_message") return { label: "AI Chat", category: "ai_chat" };
  if (lower === "knowledge") return { label: "Knowledge Base", category: "knowledge" };
  if (lower === "keyword") return { label: "Keyword Rule", category: "keyword" };
  if (lower === "default") return { label: "Default Reply", category: "default" };
  if (lower === "telegram") return { label: "Telegram Workflow", category: "workflow" };
  if (lower === "schedule") return { label: "Scheduled Workflow", category: "schedule" };
  if (lower === "webhook") return { label: "Webhook Workflow", category: "webhook" };
  if (lower === "manual") return { label: "Manual Run", category: "manual" };
  if (lower === "message") return { label: "Message", category: "message" };
  return { label: raw, category: "message" };
}

export function triggerCategoryLabel(category: ExecutionTriggerCategory): string {
  switch (category) {
    case "command":
      return "Command";
    case "ai_chat":
      return "AI Chat";
    case "knowledge":
      return "Knowledge";
    case "keyword":
      return "Keyword";
    case "default":
      return "Fallback";
    case "workflow":
      return "Automation";
    case "schedule":
      return "Schedule";
    case "webhook":
      return "Webhook";
    case "manual":
      return "Manual";
    default:
      return "Message";
  }
}

export function providerDisplayName(source: string | null | undefined): string {
  if (source === "nvidia") return "NVIDIA Build";
  if (source === "vercel") return "Vercel AI Gateway";
  return source ? source : "Platform";
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "-";
  const rounded = Math.max(0, Math.round(ms));
  if (rounded < 1000) return `${rounded.toLocaleString("en-US")} ms`;
  if (rounded < 60_000) return `${(rounded / 1000).toFixed(2)} s`;
  const mins = Math.floor(rounded / 60_000);
  const secs = ((rounded % 60_000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

export function formatCostUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

/**
 * Repairs legacy execution rows where `started_at` defaulted to insert time (after `finished_at`).
 * Always returns coherent chronological `startedAt`, `finishedAt`, and `durationMs`.
 */
export function normalizeExecutionBounds(
  startedAt: string,
  finishedAt: string | null,
  durationMs: number | null,
): { startedAt: string; finishedAt: string | null; durationMs: number | null } {
  const sMs = Date.parse(startedAt);
  const fMs = finishedAt ? Date.parse(finishedAt) : NaN;
  const dur = typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null;

  if (Number.isFinite(fMs) && dur !== null) {
    // If started_at is missing, after finished_at, or drastically mismatched (legacy default-now bug), derive true start.
    const diff = fMs - sMs;
    if (!Number.isFinite(sMs) || sMs > fMs || (dur > 250 && Math.abs(diff - dur) > Math.max(2000, dur * 0.5))) {
      return {
        startedAt: new Date(fMs - dur).toISOString(),
        finishedAt: new Date(fMs).toISOString(),
        durationMs: dur,
      };
    }
    return {
      startedAt: new Date(sMs).toISOString(),
      finishedAt: new Date(fMs).toISOString(),
      durationMs: dur,
    };
  }

  if (Number.isFinite(sMs) && Number.isFinite(fMs)) {
    const computed = Math.max(0, Math.round(fMs - sMs));
    return {
      startedAt: new Date(sMs).toISOString(),
      finishedAt: new Date(fMs).toISOString(),
      durationMs: dur ?? computed,
    };
  }

  return { startedAt, finishedAt, durationMs: dur };
}

/** Maps a recorded `node_type` into human-readable journey title, subtitle, and visual phase. */
export function describeStep(
  nodeType: string,
  nodeId = "",
  inputSummary?: Record<string, unknown> | null,
  outputSummary?: Record<string, unknown> | null,
): { title: string; subtitle: string; phase: ExecutionStepPhase } {
  const inp = inputSummary ?? {};
  const out = outputSummary ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

  switch (nodeType) {
    case "telegram.received": {
      const cmd = str(inp.command) || str(out.command);
      const from = str(inp.fromUsername) ? `@${str(inp.fromUsername)}` : str(inp.fromFirstName);
      return {
        title: cmd ? `Command /${cmd.replace(/^\//, "")} Called on Telegram` : "Telegram Message Received",
        subtitle: from ? `Received from ${from}` : "Inbound Telegram Bot API update",
        phase: "intake",
      };
    }
    case "command.parsed": {
      const cmd = str(out.command) || str(inp.command);
      const kind = str(out.kind) || str(inp.kind);
      return {
        title: cmd ? `Command Routed (${cmd.startsWith("/") ? cmd : `/${cmd}`})` : "Trigger & Command Matched",
        subtitle: kind ? `Handler mode: ${kind}` : "Validated syntax, permissions, and rate limit",
        phase: "routing",
      };
    }
    case "rule.matched": {
      const rule = str(out.ruleType) || str(inp.ruleType);
      return {
        title: rule === "keyword" ? "Keyword Rule Matched" : rule === "command" ? "Bot Command Matched" : "Bot Response Rule Resolved",
        subtitle: str(out.matchedValue) ? `Matched: ${str(out.matchedValue)}` : "Evaluated configured bot commands & rules",
        phase: "routing",
      };
    }
    case "telegram.download_file": {
      const mime = str(out.mimeType);
      const kb = typeof out.bytes === "number" ? `${Math.max(1, Math.round(out.bytes / 1024))} KB` : "";
      return {
        title: "Media Downloaded from Telegram",
        subtitle: [mime, kb].filter(Boolean).join(" · ") || "Fetched user attachment via Telegram getFile",
        phase: "retrieval",
      };
    }
    case "web.search": {
      const engine = str(out.engine) || str(out.providerSlug);
      const results = typeof out.resultCount === "number" ? `${out.resultCount} results` : "";
      return {
        title: "Open Web Search Executed",
        subtitle: [engine, results].filter(Boolean).join(" · ") || "Retrieved live web results, images & videos",
        phase: "retrieval",
      };
    }
    case "context.load": {
      const kb = typeof out.kbPassages === "number" ? `${out.kbPassages} KB` : "";
      const ak = typeof out.agentKnowledge === "number" ? `${out.agentKnowledge} notes` : "";
      const mem = typeof out.memoryMessages === "number" ? `${out.memoryMessages} memory msgs` : "";
      return {
        title: "Context, Knowledge & Memory Loaded",
        subtitle: [kb, ak, mem].filter(Boolean).join(" · ") || "Prepared system prompt and conversation history",
        phase: "retrieval",
      };
    }
    case "knowledge.retrieve": {
      const sources = typeof out.sourceCount === "number" ? `${out.sourceCount} citations` : "";
      return {
        title: "Knowledge Base Queried",
        subtitle: sources || "Searched linked Knowledge Base collections",
        phase: "retrieval",
      };
    }
    case "ai.chat": {
      const model = str(out.modelName) || str(out.modelUsed) || str(inp.model);
      const provider = providerDisplayName(str(out.source) || str(inp.source));
      return {
        title: "AI Chat Model Invoked",
        subtitle: model ? `${model} (${provider})` : "Generated response from language model",
        phase: "model",
      };
    }
    case "ai.vision": {
      const model = str(out.modelName) || str(out.modelUsed) || str(inp.model);
      const provider = providerDisplayName(str(out.source) || str(inp.source));
      return {
        title: "AI Vision Model Invoked",
        subtitle: model ? `${model} (${provider})` : "Analyzed image with multimodal vision model",
        phase: "model",
      };
    }
    case "ai.image_generate": {
      const model = str(out.modelName) || str(out.modelUsed) || str(inp.model);
      const provider = providerDisplayName(str(out.source) || str(inp.source));
      return {
        title: "AI Image Model Invoked",
        subtitle: model ? `${model} (${provider})` : "Synthesized image via diffusion model",
        phase: "model",
      };
    }
    case "telegram.send_message": {
      const chunks = typeof out.chunks === "number" && out.chunks > 1 ? `${out.chunks} chunks` : "1 message";
      const delivery = out.queued === true || (typeof out.queuedCount === "number" && out.queuedCount > 0) ? "Queued for paced delivery" : "Delivered to Telegram chat";
      return {
        title: "Output Sent to Telegram",
        subtitle: `${delivery} (${chunks})`,
        phase: "delivery",
      };
    }
    case "telegram.send_photo": {
      const kb = typeof out.bytes === "number" ? `${Math.max(1, Math.round(out.bytes / 1024))} KB` : "";
      const mime = str(out.mimeType);
      return {
        title: "Generated Image Sent to Telegram",
        subtitle: [mime, kb].filter(Boolean).join(" · ") || "Uploaded photo via Telegram sendPhoto",
        phase: "delivery",
      };
    }
    case "telegram.send_gallery": {
      const count = typeof out.sentCount === "number" ? `${out.sentCount} image(s)` : "Photo album";
      return {
        title: "Image Gallery Sent to Telegram",
        subtitle: `Delivered ${count} via Telegram sendMediaGroup`,
        phase: "delivery",
      };
    }
    case "telegram.fallback_sent":
      return {
        title: "Fallback Notice Sent to Telegram",
        subtitle: "Delivered safe recovery message to user after error",
        phase: "error",
      };
    case "memory.save":
      return {
        title: "Conversation Memory Updated",
        subtitle: "Saved user & assistant turn to chat memory",
        phase: "memory",
      };
    case "memory.clear":
      return {
        title: "Conversation Memory Cleared",
        subtitle: "Deleted prior chat history for /reset",
        phase: "memory",
      };
    default: {
      if (nodeType.startsWith("trigger.")) {
        return { title: `Workflow Trigger (${nodeType.replace("trigger.", "")})`, subtitle: nodeId ? `Node ${nodeId}` : "Automation entry point", phase: "intake" };
      }
      if (nodeType.startsWith("condition.")) {
        return { title: `Condition (${nodeType.replace("condition.", "")})`, subtitle: out.result !== undefined ? `Evaluated to ${String(out.result)}` : "Evaluated branch condition", phase: "routing" };
      }
      if (nodeType === "action.telegram.sendMessage") {
        return { title: "Workflow Action: Send Telegram Message", subtitle: str(out.externalMessageId) ? `Message #${str(out.externalMessageId)}` : "Dispatched outbound Telegram message", phase: "delivery" };
      }
      if (nodeType === "action.http.request") {
        return { title: "Workflow Action: HTTP Request", subtitle: typeof out.status === "number" ? `HTTP ${out.status}` : "Executed outbound webhook call", phase: "workflow" };
      }
      return { title: nodeType.replace(/[._]/g, " "), subtitle: nodeId ? `Step ${nodeId}` : "Execution step", phase: "workflow" };
    }
  }
}

const PHASE_LABELS: Record<ExecutionStepPhase, string> = {
  intake: "Command Intake",
  routing: "Routing & Rules",
  retrieval: "Media / Search / KB",
  model: "AI Model Inference",
  delivery: "Telegram Delivery",
  memory: "Memory",
  workflow: "Workflow Actions",
  error: "Error Recovery",
};

/** Computes proportional time breakdown per execution phase for visual waterfall bars. */
export function computePhaseBreakdown(
  steps: ExecutionStepDto[],
  totalDurationMs: number | null,
): ExecutionPhaseSlice[] {
  const buckets = new Map<ExecutionStepPhase, number>();
  for (const s of steps) {
    const dur = typeof s.durationMs === "number" && s.durationMs > 0 ? s.durationMs : 0;
    if (dur <= 0) continue;
    buckets.set(s.phase, (buckets.get(s.phase) ?? 0) + dur);
  }
  const sum = [...buckets.values()].reduce((a, b) => a + b, 0);
  const denom = Math.max(sum, totalDurationMs ?? 0, 1);
  return [...buckets.entries()]
    .map(([phase, durationMs]) => ({
      phase,
      label: PHASE_LABELS[phase],
      durationMs: Math.round(durationMs),
      pct: Math.max(1, Math.round((durationMs / denom) * 100)),
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
}

/** Extracts a concise actor display label from trigger_payload JSON. */
export function extractActorFromPayload(payload: Record<string, unknown> | null | undefined): ExecutionActorDto {
  if (!payload || typeof payload !== "object") {
    return { chatId: null, chatType: null, userId: null, username: null, firstName: null, updateId: null, messageId: null };
  }
  const from = payload.from && typeof payload.from === "object" ? (payload.from as Record<string, unknown>) : null;
  const chatId = payload.chatId !== undefined && payload.chatId !== null ? String(payload.chatId) : null;
  const chatType = typeof payload.chatType === "string" ? payload.chatType : null;
  const userId = from?.id !== undefined && from?.id !== null ? String(from.id) : null;
  const username = typeof from?.username === "string" && from.username.trim() ? from.username.trim() : null;
  const firstName = typeof from?.firstName === "string" && from.firstName.trim() ? from.firstName.trim() : null;
  const updateId = typeof payload.updateId === "number" ? payload.updateId : null;
  const messageId = typeof payload.messageId === "number" ? payload.messageId : null;
  return { chatId, chatType, userId, username, firstName, updateId, messageId };
}

export function formatActorLabel(actor: ExecutionActorDto): string | null {
  if (actor.username) return `@${actor.username}`;
  if (actor.firstName) return actor.firstName;
  if (actor.chatId) return `Chat ${actor.chatId}`;
  return null;
}

/** Computes p-th percentile (0..1) from an unsorted array of durations. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Math.round(sorted[idx] ?? 0);
}

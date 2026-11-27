import { category, LIMITS, type WorkflowDefinition, type WorkflowNode } from "./schema";
import { assertSafeOutboundUrl } from "./ssrf";
import { validateWorkflow } from "./validate";

export interface TriggerEvent {
  type: string;
  workspaceId: string;
  source: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

/** Adapter boundary: the engine never talks to Telegram or HTTP directly. */
export interface ActionAdapters {
  sendTelegramMessage(input: { botId: string; chatId: string; text: string; idempotencyKey: string }): Promise<{ externalMessageId?: string }>;
  httpRequest(input: { method: string; url: URL; body?: string }): Promise<{ status: number }>;
  insertRecord?(input: { collection: string; record: Record<string, string> }): Promise<void>;
  runAiResearch?(input: {
    prompt: string;
    systemPrompt?: string;
    agentId?: string;
    category?: string;
    modelSlug?: string;
    includeWebSearch: boolean;
    includeMarketData: boolean;
  }): Promise<{ text: string; sourcesCount?: number; quotesCount?: number; modelUsed?: string }>;
}

export type StepStatus = "succeeded" | "failed" | "skipped";
export interface StepResult {
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  errorCode?: string;
  errorMessageSafe?: string;
}

export interface ExecutionResult {
  status: "succeeded" | "failed";
  steps: StepResult[];
}

/** Resolves `a.b[0].c` against the event payload. */
export function getPath(obj: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

/** `{{event.field}}` and `{{ai.text}}` substitution; unknown paths become empty strings. */
export function renderTemplate(text: string, event: TriggerEvent, extra?: Record<string, unknown>): string {
  const scope: Record<string, unknown> = { event: event.payload, ...extra };
  return text.replace(/\{\{\s*([A-Za-z0-9_.\[\]-]+)\s*\}\}/g, (_, p: string) => {
    const v = getPath(scope, p);
    return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

function evalCondition(node: WorkflowNode, event: TriggerEvent, lastHttpStatus?: number): boolean {
  const c = node.config as Record<string, unknown>;
  const val = () => getPath({ event: event.payload }, String(c.field));
  switch (node.type) {
    case "condition.equals": return String(val() ?? "") === String(c.value);
    case "condition.notEquals": return String(val() ?? "") !== String(c.value);
    case "condition.contains": {
      const hay = String(val() ?? "");
      const needle = String(c.value);
      return c.caseSensitive ? hay.includes(needle) : hay.toLowerCase().includes(needle.toLowerCase());
    }
    case "condition.isEmpty": {
      const v = val();
      return v === undefined || v === null || v === "";
    }
    case "condition.httpStatus":
      return lastHttpStatus !== undefined && lastHttpStatus >= Number(c.min) && lastHttpStatus <= Number(c.max);
    default: return false;
  }
}

/**
 * Deterministic traversal. Conditions select the `true`/`false` edge; untagged edges always fire.
 * Network calls are delegated to adapters, which must enforce their own timeouts.
 */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  event: TriggerEvent,
  adapters: ActionAdapters,
  opts: { executionId: string; now?: () => number } = { executionId: "exec" },
): Promise<ExecutionResult> {
  const check = validateWorkflow(definition);
  if (!check.valid) {
    return { status: "failed", steps: [{ nodeId: "-", nodeType: "workflow", status: "failed", errorCode: "INVALID_WORKFLOW", errorMessageSafe: "Workflow failed validation." }] };
  }

  const now = opts.now ?? Date.now;
  const started = now();
  const byId = new Map(definition.nodes.map((n) => [n.id, n]));
  const steps: StepResult[] = [];
  let actions = 0;
  let lastHttpStatus: number | undefined;
  let aiVars: Record<string, unknown> | undefined;
  let failed = false;

  const trigger = definition.nodes.find((n) => category(n.type) === "trigger")!;
  const queue: string[] = [trigger.id];
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id)!;

    if (now() - started > LIMITS.maxExecutionMs) {
      steps.push({ nodeId: id, nodeType: node.type, status: "failed", errorCode: "TIMEOUT", errorMessageSafe: "Execution time limit reached." });
      failed = true;
      break;
    }

    let branch: "true" | "false" | undefined;
    const cat = category(node.type);
    const stepStartMs = now();
    const stepStartedAt = new Date(stepStartMs).toISOString();

    if (cat === "trigger") {
      const doneMs = now();
      steps.push({
        nodeId: id,
        nodeType: node.type,
        status: "succeeded",
        startedAt: stepStartedAt,
        finishedAt: new Date(doneMs).toISOString(),
        durationMs: Math.max(0, doneMs - stepStartMs),
        outputSummary: { source: event.source, type: event.type },
      });
    } else if (cat === "condition") {
      const result = evalCondition(node, event, lastHttpStatus);
      branch = result ? "true" : "false";
      const doneMs = now();
      steps.push({
        nodeId: id,
        nodeType: node.type,
        status: "succeeded",
        startedAt: stepStartedAt,
        finishedAt: new Date(doneMs).toISOString(),
        durationMs: Math.max(0, doneMs - stepStartMs),
        outputSummary: { result },
      });
    } else {
      if (++actions > LIMITS.maxActionsPerExecution) {
        const doneMs = now();
        steps.push({
          nodeId: id,
          nodeType: node.type,
          status: "failed",
          startedAt: stepStartedAt,
          finishedAt: new Date(doneMs).toISOString(),
          durationMs: Math.max(0, doneMs - stepStartMs),
          errorCode: "ACTION_LIMIT",
          errorMessageSafe: "Too many actions in one execution.",
        });
        failed = true;
        break;
      }
      try {
        const c = node.config as Record<string, unknown>;
        const tplVars = aiVars ? { ai: aiVars } : undefined;
        if (node.type === "action.telegram.sendMessage") {
          const chatId = c.chatIdSource === "trigger" ? String(getPath({ event: event.payload }, "event.chatId") ?? "") : String(c.chatId ?? "");
          if (!chatId) throw Object.assign(new Error("No chat ID."), { code: "NO_CHAT_ID" });
          const rendered = renderTemplate(String(c.text ?? ""), event, tplVars);
          const r = await adapters.sendTelegramMessage({
            botId: String(c.botId ?? ""),
            chatId,
            text: rendered,
            idempotencyKey: `${opts.executionId}:${id}`,
          });
          const doneMs = now();
          steps.push({
            nodeId: id,
            nodeType: node.type,
            status: "succeeded",
            startedAt: stepStartedAt,
            finishedAt: new Date(doneMs).toISOString(),
            durationMs: Math.max(0, doneMs - stepStartMs),
            inputSummary: { botId: String(c.botId ?? ""), chatId, preview: rendered.slice(0, 500) },
            outputSummary: { externalMessageId: r.externalMessageId },
          });
        } else if (node.type === "action.http.request") {
          const url = assertSafeOutboundUrl(String(c.url ?? ""));
          const r = await adapters.httpRequest({ method: String(c.method ?? "GET"), url, body: c.body ? renderTemplate(String(c.body), event, tplVars) : undefined });
          lastHttpStatus = r.status;
          const doneMs = now();
          steps.push({
            nodeId: id,
            nodeType: node.type,
            status: "succeeded",
            startedAt: stepStartedAt,
            finishedAt: new Date(doneMs).toISOString(),
            durationMs: Math.max(0, doneMs - stepStartMs),
            inputSummary: { method: String(c.method ?? "GET"), url: url.origin + url.pathname },
            outputSummary: { status: r.status },
          });
        } else if (node.type === "action.database.insert") {
          if (!adapters.insertRecord) throw Object.assign(new Error("Unavailable."), { code: "UNSUPPORTED" });
          await adapters.insertRecord({ collection: String(c.collection ?? ""), record: c.record as Record<string, string> });
          const doneMs = now();
          steps.push({
            nodeId: id,
            nodeType: node.type,
            status: "succeeded",
            startedAt: stepStartedAt,
            finishedAt: new Date(doneMs).toISOString(),
            durationMs: Math.max(0, doneMs - stepStartMs),
            inputSummary: { collection: String(c.collection ?? "") },
          });
        } else if (node.type === "action.ai.research") {
          if (!adapters.runAiResearch) throw Object.assign(new Error("AI research adapter unavailable."), { code: "UNSUPPORTED" });
          const renderedPrompt = renderTemplate(String(c.prompt ?? ""), event, tplVars);
          const r = await adapters.runAiResearch({
            prompt: renderedPrompt,
            systemPrompt: typeof c.systemPrompt === "string" && c.systemPrompt.trim() ? renderTemplate(c.systemPrompt, event, tplVars) : undefined,
            agentId: typeof c.agentId === "string" && c.agentId.trim() ? c.agentId.trim() : undefined,
            category: typeof c.category === "string" && c.category.trim() ? c.category.trim() : undefined,
            modelSlug: typeof c.modelSlug === "string" && c.modelSlug.trim() ? c.modelSlug.trim() : undefined,
            includeWebSearch: c.includeWebSearch !== false,
            includeMarketData: c.includeMarketData !== false,
          });
          aiVars = {
            text: r.text,
            summary: r.text.slice(0, 500),
            sourcesCount: r.sourcesCount ?? 0,
            quotesCount: r.quotesCount ?? 0,
            modelUsed: r.modelUsed ?? "",
          };
          const doneMs = now();
          steps.push({
            nodeId: id,
            nodeType: node.type,
            status: "succeeded",
            startedAt: stepStartedAt,
            finishedAt: new Date(doneMs).toISOString(),
            durationMs: Math.max(0, doneMs - stepStartMs),
            inputSummary: { promptPreview: renderedPrompt.slice(0, 300), includeWebSearch: c.includeWebSearch !== false, includeMarketData: c.includeMarketData !== false },
            outputSummary: { modelUsed: r.modelUsed, sourcesCount: r.sourcesCount ?? 0, quotesCount: r.quotesCount ?? 0, outputPreview: r.text.slice(0, 600) },
          });
        }
      } catch (e) {
        const code = (e as { code?: string }).code ?? "ACTION_FAILED";
        const doneMs = now();
        steps.push({
          nodeId: id,
          nodeType: node.type,
          status: "failed",
          startedAt: stepStartedAt,
          finishedAt: new Date(doneMs).toISOString(),
          durationMs: Math.max(0, doneMs - stepStartMs),
          errorCode: code,
          errorMessageSafe: e instanceof Error ? e.message.slice(0, 200) : "Action failed.",
        });
        failed = true;
        break;
      }
    }

    for (const edge of definition.edges.filter((e) => e.source === id)) {
      if (edge.sourceHandle && edge.sourceHandle !== branch) continue;
      queue.push(edge.target);
    }
  }

  for (const n of definition.nodes) {
    if (!visited.has(n.id) && !failed) steps.push({ nodeId: n.id, nodeType: n.type, status: "skipped" });
  }
  return { status: failed ? "failed" : "succeeded", steps };
}

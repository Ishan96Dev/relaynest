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
}

export type StepStatus = "succeeded" | "failed" | "skipped";
export interface StepResult {
  nodeId: string;
  nodeType: string;
  status: StepStatus;
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

/** `{{event.field}}` substitution; unknown paths become empty strings. */
export function renderTemplate(text: string, event: TriggerEvent): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_.\[\]-]+)\s*\}\}/g, (_, p: string) => {
    const v = getPath({ event: event.payload }, p);
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

    if (cat === "trigger") {
      steps.push({ nodeId: id, nodeType: node.type, status: "succeeded" });
    } else if (cat === "condition") {
      const result = evalCondition(node, event, lastHttpStatus);
      branch = result ? "true" : "false";
      steps.push({ nodeId: id, nodeType: node.type, status: "succeeded", outputSummary: { result } });
    } else {
      if (++actions > LIMITS.maxActionsPerExecution) {
        steps.push({ nodeId: id, nodeType: node.type, status: "failed", errorCode: "ACTION_LIMIT", errorMessageSafe: "Too many actions in one execution." });
        failed = true;
        break;
      }
      try {
        const c = node.config as Record<string, string>;
        if (node.type === "action.telegram.sendMessage") {
          const chatId = c.chatIdSource === "trigger" ? String(getPath({ event: event.payload }, "event.chatId") ?? "") : String(c.chatId ?? "");
          if (!chatId) throw Object.assign(new Error("No chat ID."), { code: "NO_CHAT_ID" });
          const r = await adapters.sendTelegramMessage({
            botId: c.botId!,
            chatId,
            text: renderTemplate(c.text!, event),
            idempotencyKey: `${opts.executionId}:${id}`,
          });
          steps.push({ nodeId: id, nodeType: node.type, status: "succeeded", outputSummary: { externalMessageId: r.externalMessageId } });
        } else if (node.type === "action.http.request") {
          const url = assertSafeOutboundUrl(c.url!);
          const r = await adapters.httpRequest({ method: c.method!, url, body: c.body ? renderTemplate(c.body, event) : undefined });
          lastHttpStatus = r.status;
          steps.push({ nodeId: id, nodeType: node.type, status: "succeeded", outputSummary: { status: r.status } });
        } else if (node.type === "action.database.insert") {
          if (!adapters.insertRecord) throw Object.assign(new Error("Unavailable."), { code: "UNSUPPORTED" });
          await adapters.insertRecord({ collection: c.collection!, record: c.record as unknown as Record<string, string> });
          steps.push({ nodeId: id, nodeType: node.type, status: "succeeded" });
        }
      } catch (e) {
        const code = (e as { code?: string }).code ?? "ACTION_FAILED";
        steps.push({ nodeId: id, nodeType: node.type, status: "failed", errorCode: code, errorMessageSafe: e instanceof Error ? e.message.slice(0, 200) : "Action failed." });
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

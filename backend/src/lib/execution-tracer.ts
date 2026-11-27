import {
  describeStep,
  normalizeExecutionBounds,
  parseTriggerInfo,
  providerDisplayName,
  type ExecutionAiCallDto,
  type ExecutionStepDto,
} from "./execution-format";

export interface RecordedStep {
  stepOrder: number;
  nodeId: string;
  nodeType: string;
  status: "succeeded" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  inputSummary: Record<string, unknown> | null;
  outputSummary: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
}

/** Keeps step JSONB payloads bounded and strips undefined values so Supabase inserts never bloat. */
export function sanitizeSummary(obj?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      out[k] = v.length > 1500 ? `${v.slice(0, 1497)}...` : v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 20).map((item) => (typeof item === "string" && item.length > 300 ? `${item.slice(0, 297)}...` : item));
    } else {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Extracts a safe, user-readable error description without exposing raw tokens or secrets. */
export function safeErrorMessage(err: unknown, fallback = "An unexpected error occurred."): string {
  if (err instanceof Error && err.message.trim()) {
    // Strip anything resembling a Telegram token or Bearer credential.
    return err.message
      .replace(/\b\d{6,16}:[A-Za-z0-9_-]{20,}\b/g, "[redacted-token]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .slice(0, 280);
  }
  return fallback;
}

/**
 * Lightweight, zero-overhead chronological step tracer for Telegram commands, AI agents, and bot rules.
 * Records every stage (Command Called -> Media/Search/KB -> AI Model -> Output Sent to Telegram) with exact ms timestamps.
 */
export class ExecutionTracer {
  readonly startedMs: number;
  private readonly now: () => number;
  private readonly steps: RecordedStep[] = [];
  private seq = 0;

  constructor(opts?: { startedMs?: number; now?: () => number }) {
    this.now = opts?.now ?? Date.now;
    this.startedMs = opts?.startedMs ?? this.now();
  }

  get list(): readonly RecordedStep[] {
    return this.steps;
  }

  /** Records an instant or pre-measured milestone step. */
  record(
    nodeId: string,
    nodeType: string,
    opts?: {
      status?: "succeeded" | "failed" | "skipped";
      startedMs?: number;
      finishedMs?: number;
      inputSummary?: Record<string, unknown> | null;
      outputSummary?: Record<string, unknown> | null;
      errorCode?: string | null;
      errorMessageSafe?: string | null;
    },
  ): RecordedStep {
    const start = opts?.startedMs ?? this.now();
    const end = Math.max(start, opts?.finishedMs ?? this.now());
    const step: RecordedStep = {
      stepOrder: ++this.seq,
      nodeId,
      nodeType,
      status: opts?.status ?? "succeeded",
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date(end).toISOString(),
      durationMs: Math.max(0, Math.round(end - start)),
      inputSummary: sanitizeSummary(opts?.inputSummary),
      outputSummary: sanitizeSummary(opts?.outputSummary),
      errorCode: opts?.errorCode ?? null,
      errorMessageSafe: opts?.errorMessageSafe ? opts.errorMessageSafe.slice(0, 280) : null,
    };
    this.steps.push(step);
    return step;
  }

  /** Wraps an async operation, recording exact start/end/duration and capturing failure details automatically. */
  async trace<T>(
    nodeId: string,
    nodeType: string,
    inputSummary: Record<string, unknown> | null,
    fn: () => Promise<T>,
    summarizeOutput?: (result: T) => Record<string, unknown> | null,
  ): Promise<T> {
    const start = this.now();
    try {
      const result = await fn();
      const end = this.now();
      this.record(nodeId, nodeType, {
        status: "succeeded",
        startedMs: start,
        finishedMs: end,
        inputSummary,
        outputSummary: summarizeOutput ? summarizeOutput(result) : null,
      });
      return result;
    } catch (err) {
      const end = this.now();
      const code =
        typeof (err as { code?: unknown })?.code === "string"
          ? String((err as { code: string }).code)
          : "STEP_FAILED";
      this.record(nodeId, nodeType, {
        status: "failed",
        startedMs: start,
        finishedMs: end,
        inputSummary,
        errorCode: code,
        errorMessageSafe: safeErrorMessage(err),
      });
      throw err;
    }
  }

  /** Converts collected steps into DB rows ready for `public.execution_steps`. */
  toDbRows(workspaceId: string, executionId: string) {
    return this.steps.map((s) => ({
      workspace_id: workspaceId,
      execution_id: executionId,
      step_order: s.stepOrder,
      node_id: s.nodeId,
      node_type: s.nodeType,
      status: s.status,
      started_at: s.startedAt,
      finished_at: s.finishedAt,
      duration_ms: s.durationMs,
      input_summary: s.inputSummary,
      output_summary: s.outputSummary,
      error_code: s.errorCode,
      error_message_safe: s.errorMessageSafe,
    }));
  }
}

export interface LegacyReconstructionInput {
  executionId: string;
  triggerType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  botName: string | null;
  botUsername: string | null;
  agentModelName: string | null;
  agentImageModelName: string | null;
  aiCalls: ExecutionAiCallDto[];
  chatMessagePair?: { userText: string; assistantText: string; chatId: string } | null;
}

/**
 * Builds an accurate, clearly-marked reconstructed journey for historical executions recorded
 * before step-level tracing was enabled, correlating real `ai_usage_events` and agent memory.
 */
export function reconstructLegacySteps(input: LegacyReconstructionInput): ExecutionStepDto[] {
  const bounds = normalizeExecutionBounds(input.startedAt, input.finishedAt, input.durationMs);
  const startMs = Date.parse(bounds.startedAt);
  const totalMs = Math.max(0, bounds.durationMs ?? 0);
  const endMs = bounds.finishedAt ? Date.parse(bounds.finishedAt) : startMs + totalMs;
  const info = parseTriggerInfo(input.triggerType);
  const steps: ExecutionStepDto[] = [];
  let order = 0;

  const push = (
    nodeId: string,
    nodeType: string,
    sMs: number,
    eMs: number,
    stepStatus: "succeeded" | "failed" | "skipped",
    inputSummary: Record<string, unknown> | null,
    outputSummary: Record<string, unknown> | null,
    err?: { code?: string | null; message?: string | null },
  ) => {
    const safeStart = Math.max(startMs, Math.min(sMs, endMs));
    const safeEnd = Math.max(safeStart, Math.min(eMs, endMs));
    const dur = Math.max(0, Math.round(safeEnd - safeStart));
    const desc = describeStep(nodeType, nodeId, inputSummary, outputSummary);
    steps.push({
      id: `reconstructed-${input.executionId}-${++order}`,
      stepOrder: order,
      nodeId,
      nodeType,
      title: desc.title,
      subtitle: desc.subtitle,
      phase: desc.phase,
      status: stepStatus,
      startedAt: new Date(safeStart).toISOString(),
      finishedAt: new Date(safeEnd).toISOString(),
      durationMs: dur,
      offsetMs: Math.max(0, Math.round(safeStart - startMs)),
      inputSummary,
      outputSummary,
      errorCode: err?.code ?? null,
      errorMessageSafe: err?.message ?? null,
      inferred: true,
    });
  };

  // Step 1: Inbound Telegram trigger / command received
  const intakeEnd = startMs + Math.min(40, Math.round(totalMs * 0.04));
  push(
    "intake",
    "telegram.received",
    startMs,
    intakeEnd,
    "succeeded",
    {
      command: info.command ? `/${info.command}` : undefined,
      trigger: input.triggerType,
      bot: input.botUsername ? `@${input.botUsername}` : input.botName ?? undefined,
      ...(input.chatMessagePair ? { text: input.chatMessagePair.userText, chatId: input.chatMessagePair.chatId } : {}),
    },
    { routedTo: info.label },
  );

  // Step 2: Command routing / media prep for /describe or /imagine or /search
  const sortedAi = [...input.aiCalls].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const firstAi = sortedAi[0];
  let cursorMs = intakeEnd;

  if (info.command === "describe") {
    const aiStart = firstAi && firstAi.latencyMs ? Math.max(cursorMs, Date.parse(firstAi.createdAt) - firstAi.latencyMs) : cursorMs + Math.round(totalMs * 0.12);
    push(
      "download_photo",
      "telegram.download_file",
      cursorMs,
      Math.max(cursorMs, Math.min(aiStart, endMs)),
      "succeeded",
      { command: "/describe" },
      { note: "Downloaded Telegram photo attachment for multimodal vision analysis" },
    );
    cursorMs = Math.max(cursorMs, Math.min(aiStart, endMs));
  } else if (info.command) {
    const routeEnd = cursorMs + Math.min(35, Math.round(totalMs * 0.03));
    push(
      "route",
      "command.parsed",
      cursorMs,
      routeEnd,
      "succeeded",
      { command: `/${info.command}` },
      { command: `/${info.command}`, kind: info.command === "imagine" ? "image" : info.command === "search" ? "search" : "command" },
    );
    cursorMs = routeEnd;
  }

  // Step 3: AI model call(s) — correlated from real ai_usage_events if available!
  if (sortedAi.length > 0) {
    for (let i = 0; i < sortedAi.length; i++) {
      const call = sortedAi[i]!;
      const lat = Math.max(0, call.latencyMs ?? 0);
      const callEnd = Math.min(endMs, Math.max(cursorMs + lat, Date.parse(call.createdAt)));
      const callStart = Math.max(cursorMs, callEnd - lat);
      const nodeType = call.kind === "vision" ? "ai.vision" : call.kind === "image" ? "ai.image_generate" : "ai.chat";
      push(
        `model_${i + 1}`,
        nodeType,
        callStart,
        callEnd,
        "succeeded",
        {
          model: call.apiModelId ?? call.modelSlug,
          source: call.source,
          ...(input.chatMessagePair ? { promptPreview: input.chatMessagePair.userText } : {}),
        },
        {
          modelUsed: call.apiModelId ?? call.modelSlug,
          modelSlug: call.modelSlug,
          source: call.source,
          provider: providerDisplayName(call.source),
          kind: call.kind,
          promptTokens: call.promptTokens,
          completionTokens: call.completionTokens,
          totalTokens: call.totalTokens,
          costUsd: call.costUsd,
          latencyMs: call.latencyMs,
          ...(input.chatMessagePair ? { outputPreview: input.chatMessagePair.assistantText } : {}),
        },
      );
      cursorMs = Math.max(cursorMs, callEnd);
    }
  } else if (info.command === "imagine" && totalMs > 1500) {
    // Image generation calls > 1.5s that predate execution_id linkage
    const genEnd = Math.max(cursorMs, endMs - Math.min(600, Math.round(totalMs * 0.15)));
    push(
      "model_1",
      "ai.image_generate",
      cursorMs,
      genEnd,
      input.status === "failed" ? "failed" : "succeeded",
      { model: input.agentImageModelName ?? "Image Generation Model" },
      { modelName: input.agentImageModelName ?? "Image Generation Model" },
      input.status === "failed" ? { code: input.errorCode, message: input.errorMessage } : undefined,
    );
    cursorMs = genEnd;
  }

  // Step 4: Output sent to Telegram
  const deliveryType = info.command === "imagine" && totalMs > 1500 && input.status === "succeeded"
    ? "telegram.send_photo"
    : "telegram.send_message";
  const deliveryStatus = input.status === "failed" && sortedAi.length > 0 ? "failed" : input.status === "failed" ? "failed" : "succeeded";
  push(
    "telegram_delivery",
    deliveryType,
    cursorMs,
    endMs,
    deliveryStatus,
    {
      bot: input.botUsername ? `@${input.botUsername}` : input.botName ?? undefined,
      ...(input.chatMessagePair ? { chatId: input.chatMessagePair.chatId } : {}),
    },
    {
      delivered: deliveryStatus === "succeeded",
      ...(input.chatMessagePair ? { replyPreview: input.chatMessagePair.assistantText } : {}),
    },
    deliveryStatus === "failed" ? { code: input.errorCode, message: input.errorMessage } : undefined,
  );

  return steps;
}

import "server-only";
import { publicEnv } from "@backend/lib/env/public";
import { Errors } from "@backend/lib/http/api";
import {
  computePhaseBreakdown,
  describeStep,
  extractActorFromPayload,
  formatActorLabel,
  normalizeExecutionBounds,
  parseTriggerInfo,
  percentile,
  providerDisplayName,
  type BotAnalyticsPayload,
  type BotModelUsageRow,
  type CommandStatRow,
  type ExecutionAiCallDto,
  type ExecutionDetailDto,
  type ExecutionStepDto,
  type ExecutionSummaryItem,
} from "@backend/lib/execution-format";
import {
  ExecutionTracer,
  reconstructLegacySteps,
  sanitizeSummary,
} from "@backend/lib/execution-tracer";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { parseTools } from "@backend/server/ai/agent";
import type { AuthContext } from "@backend/server/auth/context";
import { getBot } from "@backend/server/repositories/bots";
import type { TelegramUpdate } from "@backend/server/telegram/client";

export { ExecutionTracer, safeErrorMessage } from "@backend/lib/execution-tracer";

/** Builds a structured, bounded JSON summary of an inbound Telegram update for `executions.trigger_payload`. */
export function buildTelegramTriggerPayload(
  update: TelegramUpdate,
  extra?: {
    botUsername?: string | null;
    command?: string | null;
    commandInput?: string | null;
    kind?: string | null;
  },
): Record<string, unknown> {
  const msg = update.message;
  const text = (msg?.text ?? msg?.caption ?? "").trim();
  const largestPhoto = msg?.photo?.length
    ? [...msg.photo].sort((a, b) => (b.file_size ?? b.width * b.height) - (a.file_size ?? a.width * a.height))[0]
    : undefined;
  const hasImageDoc = Boolean(msg?.document?.mime_type?.startsWith("image/"));

  return (
    sanitizeSummary({
      updateId: update.update_id,
      messageId: msg?.message_id ?? null,
      chatId: msg?.chat?.id !== undefined ? String(msg.chat.id) : null,
      chatType: msg?.chat?.type ?? null,
      from: msg?.from
        ? {
            id: msg.from.id,
            username: msg.from.username ?? null,
            firstName: msg.from.first_name ?? null,
          }
        : null,
      text: text ? text.slice(0, 1200) : null,
      command: extra?.command ?? null,
      commandInput: extra?.commandInput ? extra.commandInput.slice(0, 1000) : null,
      kind: extra?.kind ?? null,
      botUsername: extra?.botUsername ?? null,
      hasPhoto: Boolean(msg?.photo?.length || hasImageDoc),
      photoDimensions: largestPhoto ? `${largestPhoto.width}x${largestPhoto.height}` : undefined,
      photoBytes: largestPhoto?.file_size ?? (hasImageDoc ? msg?.document?.file_size : undefined),
    }) ?? {}
  );
}

/** Inserts an initial `running` execution row so `executionId` exists immediately for AI usage & step linkage. */
export async function startExecutionRecord(input: {
  workspaceId: string;
  botId: string;
  triggerType: string;
  idempotencyKey?: string;
  startedMs: number;
  triggerPayload: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("executions")
      .insert({
        workspace_id: input.workspaceId,
        bot_id: input.botId,
        trigger_type: input.triggerType,
        status: "running",
        started_at: new Date(input.startedMs).toISOString(),
        idempotency_key: input.idempotencyKey ?? null,
        trigger_payload: input.triggerPayload,
      })
      .select("id")
      .single();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Finalizes the execution row, persists all recorded journey steps, and atomically increments `bots.messages_count`. */
export async function finishExecutionRecord(input: {
  executionId: string | null;
  workspaceId: string;
  botId: string;
  triggerType: string;
  status: "succeeded" | "failed" | "cancelled";
  startedMs: number;
  finishedMs?: number;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
  idempotencyKey?: string;
  triggerPayload: Record<string, unknown>;
  tracer: ExecutionTracer;
  incrementMessages?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const finishedMs = Math.max(input.startedMs, input.finishedMs ?? Date.now());
  const startedIso = new Date(input.startedMs).toISOString();
  const finishedIso = new Date(finishedMs).toISOString();
  const durationMs = Math.max(0, Math.round(finishedMs - input.startedMs));

  let execId = input.executionId;
  if (execId) {
    await admin
      .from("executions")
      .update({
        trigger_type: input.triggerType,
        status: input.status,
        started_at: startedIso,
        finished_at: finishedIso,
        duration_ms: durationMs,
        error_code: input.errorCode ?? null,
        error_message_safe: input.errorMessageSafe ?? null,
        trigger_payload: input.triggerPayload,
      })
      .eq("id", execId);
  } else {
    const { data } = await admin
      .from("executions")
      .insert({
        workspace_id: input.workspaceId,
        bot_id: input.botId,
        trigger_type: input.triggerType,
        status: input.status,
        started_at: startedIso,
        finished_at: finishedIso,
        duration_ms: durationMs,
        error_code: input.errorCode ?? null,
        error_message_safe: input.errorMessageSafe ?? null,
        idempotency_key: input.idempotencyKey ?? null,
        trigger_payload: input.triggerPayload,
      })
      .select("id")
      .single();
    execId = (data?.id as string | undefined) ?? null;
  }

  const tasks: PromiseLike<unknown>[] = [];

  if (execId && input.tracer.list.length > 0) {
    tasks.push(admin.from("execution_steps").insert(input.tracer.toDbRows(input.workspaceId, execId)));
  }

  if (input.incrementMessages !== false) {
    tasks.push(
      Promise.resolve(admin.rpc("increment_bot_messages", { p_bot_id: input.botId, p_delta: 1 })).then(async (res) => {
        if (res.error) {
          // Graceful fallback if RPC isn't available yet in a local/unmigrated DB.
          await admin.from("bots").update({ last_update_at: finishedIso }).eq("id", input.botId);
        }
      }),
    );
  } else {
    tasks.push(admin.from("bots").update({ last_update_at: finishedIso }).eq("id", input.botId));
  }

  await Promise.allSettled(tasks);
}

/** Computes real executions count and distinct active Telegram users across a list of bots. */
export async function getBotUsageStats(
  ctx: AuthContext,
  botIds: string[],
): Promise<Map<string, { executionsCount: number; activeUsers: number }>> {
  const result = new Map<string, { executionsCount: number; activeUsers: number }>();
  if (!botIds.length) return result;

  const userSets = new Map<string, Set<string>>();
  for (const id of botIds) {
    result.set(id, { executionsCount: 0, activeUsers: 0 });
    userSets.set(id, new Set());
  }

  const [execRes, agentsRes] = await Promise.all([
    ctx.supabase
      .from("executions")
      .select("bot_id, trigger_payload")
      .eq("workspace_id", ctx.workspaceId)
      .in("bot_id", botIds)
      .limit(5000),
    ctx.supabase
      .from("ai_agents")
      .select("id, bot_id")
      .eq("workspace_id", ctx.workspaceId)
      .in("bot_id", botIds),
  ]);

  for (const row of execRes.data ?? []) {
    const bid = row.bot_id as string | null;
    if (!bid) continue;
    const entry = result.get(bid);
    if (entry) entry.executionsCount += 1;
    const actor = extractActorFromPayload(row.trigger_payload as Record<string, unknown> | null);
    const uid = actor.userId ?? actor.chatId;
    if (uid) userSets.get(bid)?.add(uid);
  }

  const agentToBot = new Map<string, string>();
  for (const a of agentsRes.data ?? []) {
    if (a.id && a.bot_id) agentToBot.set(a.id as string, a.bot_id as string);
  }

  if (agentToBot.size > 0) {
    const { data: msgRows } = await ctx.supabase
      .from("ai_agent_messages")
      .select("agent_id, chat_id")
      .eq("workspace_id", ctx.workspaceId)
      .in("agent_id", [...agentToBot.keys()])
      .limit(5000);
    for (const m of msgRows ?? []) {
      const bid = agentToBot.get(m.agent_id as string);
      if (bid && m.chat_id) userSets.get(bid)?.add(String(m.chat_id));
    }
  }

  for (const [bid, set] of userSets) {
    const entry = result.get(bid);
    if (entry) entry.activeUsers = set.size;
  }

  return result;
}

type AiUsageRow = {
  id: number;
  source: string;
  model_slug: string;
  api_model_id: string | null;
  kind: string;
  origin: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | string;
  latency_ms: number | null;
  provider_request_id: string | null;
  created_at: string;
  bot_id?: string | null;
  execution_id?: string | null;
};

function toAiCallDto(r: AiUsageRow): ExecutionAiCallDto {
  return {
    id: Number(r.id),
    source: (r.source === "vercel" ? "vercel" : "nvidia"),
    modelSlug: String(r.model_slug),
    apiModelId: r.api_model_id ?? null,
    kind: String(r.kind),
    origin: String(r.origin),
    promptTokens: Number(r.prompt_tokens ?? 0),
    completionTokens: Number(r.completion_tokens ?? 0),
    totalTokens: Number(r.total_tokens ?? 0),
    costUsd: Number(r.cost_usd ?? 0) || 0,
    latencyMs: typeof r.latency_ms === "number" ? r.latency_ms : null,
    providerRequestId: r.provider_request_id ?? null,
    createdAt: String(r.created_at),
  };
}

function relJoin<T>(val: unknown): T | null {
  if (!val) return null;
  return (Array.isArray(val) ? val[0] : val) as T | null;
}

/** Loads complete execution metadata, ordered step-by-step journey, AI model calls, and phase waterfall for the detail modal. */
export async function getExecutionDetail(ctx: AuthContext, executionId: string): Promise<ExecutionDetailDto> {
  const { data: ex, error } = await ctx.supabase
    .from("executions")
    .select(
      "id, workspace_id, bot_id, workflow_id, workflow_version, trigger_type, status, idempotency_key, started_at, finished_at, duration_ms, error_code, error_message_safe, trigger_payload, bots(id, name, telegram_username), workflows(id, name)",
    )
    .eq("id", executionId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error) throw new Error("Failed to load execution");
  if (!ex) throw Errors.notFound("Execution");

  const botRel = relJoin<{ id: string; name: string; telegram_username: string | null }>(ex.bots);
  const wfRel = relJoin<{ id: string; name: string }>(ex.workflows);
  const bounds = normalizeExecutionBounds(
    ex.started_at as string,
    (ex.finished_at as string | null) ?? null,
    (ex.duration_ms as number | null) ?? null,
  );
  const startMs = Date.parse(bounds.startedAt);
  const endMs = bounds.finishedAt ? Date.parse(bounds.finishedAt) : startMs + (bounds.durationMs ?? 0);

  const [stepsRes, directAiRes, agentRes] = await Promise.all([
    ctx.supabase
      .from("execution_steps")
      .select("id, step_order, node_id, node_type, status, started_at, finished_at, duration_ms, input_summary, output_summary, error_code, error_message_safe")
      .eq("execution_id", executionId)
      .eq("workspace_id", ctx.workspaceId)
      .order("step_order", { ascending: true })
      .order("started_at", { ascending: true }),
    ctx.supabase
      .from("ai_usage_events")
      .select("id, source, model_slug, api_model_id, kind, origin, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, provider_request_id, created_at, bot_id, execution_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("execution_id", executionId)
      .order("created_at", { ascending: true }),
    ex.bot_id
      ? ctx.supabase
          .from("ai_agents")
          .select("id, name, ai_models!ai_agents_model_id_fkey(name, slug), image_model:ai_models!ai_agents_image_model_id_fkey(name, slug)")
          .eq("workspace_id", ctx.workspaceId)
          .eq("bot_id", ex.bot_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let aiRows = (directAiRes.data ?? []) as AiUsageRow[];

  // Correlate legacy AI usage rows (recorded before execution_id column existed) within the execution window.
  if (aiRows.length === 0 && ex.bot_id && Number.isFinite(startMs) && Number.isFinite(endMs)) {
    const winStart = new Date(startMs - 2_500).toISOString();
    const winEnd = new Date(endMs + 2_500).toISOString();
    const { data: correlated } = await ctx.supabase
      .from("ai_usage_events")
      .select("id, source, model_slug, api_model_id, kind, origin, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, provider_request_id, created_at, bot_id, execution_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("origin", "agent")
      .is("execution_id", null)
      .gte("created_at", winStart)
      .lte("created_at", winEnd)
      .order("created_at", { ascending: true })
      .limit(10);
    aiRows = (correlated ?? []) as AiUsageRow[];
  }

  const aiCalls = aiRows.map(toAiCallDto);
  const agentRow = agentRes.data as Record<string, unknown> | null;
  const agentModel = relJoin<{ name: string; slug: string }>(agentRow?.ai_models);
  const agentImgModel = relJoin<{ name: string; slug: string }>(agentRow?.image_model);

  const rawSteps = stepsRes.data ?? [];
  let steps: ExecutionStepDto[];
  let traceSource: "recorded" | "reconstructed" = "recorded";
  let chatMessagePair: { userText: string; assistantText: string; chatId: string } | null = null;

  if (rawSteps.length > 0) {
    steps = rawSteps.map((s, idx) => {
      const inp = (s.input_summary as Record<string, unknown> | null) ?? null;
      const out = (s.output_summary as Record<string, unknown> | null) ?? null;
      const desc = describeStep(String(s.node_type), String(s.node_id), inp, out);
      const sMs = s.started_at ? Date.parse(s.started_at as string) : NaN;
      const fMs = s.finished_at ? Date.parse(s.finished_at as string) : NaN;
      const dur =
        typeof s.duration_ms === "number"
          ? s.duration_ms
          : Number.isFinite(sMs) && Number.isFinite(fMs)
            ? Math.max(0, Math.round(fMs - sMs))
            : null;
      return {
        id: String(s.id),
        stepOrder: typeof s.step_order === "number" && s.step_order > 0 ? s.step_order : idx + 1,
        nodeId: String(s.node_id),
        nodeType: String(s.node_type),
        title: desc.title,
        subtitle: desc.subtitle,
        phase: desc.phase,
        status: (s.status as ExecutionStepDto["status"]) ?? "succeeded",
        startedAt: (s.started_at as string | null) ?? null,
        finishedAt: (s.finished_at as string | null) ?? null,
        durationMs: dur,
        offsetMs: Number.isFinite(sMs) && Number.isFinite(startMs) ? Math.max(0, Math.round(sMs - startMs)) : null,
        inputSummary: inp,
        outputSummary: out,
        errorCode: (s.error_code as string | null) ?? null,
        errorMessageSafe: (s.error_message_safe as string | null) ?? null,
      };
    });
  } else {
    traceSource = "reconstructed";
    if (agentRow?.id && Number.isFinite(startMs) && Number.isFinite(endMs)) {
      const { data: msgRows } = await ctx.supabase
        .from("ai_agent_messages")
        .select("chat_id, role, content, created_at")
        .eq("workspace_id", ctx.workspaceId)
        .eq("agent_id", agentRow.id as string)
        .gte("created_at", new Date(startMs - 2_000).toISOString())
        .lte("created_at", new Date(endMs + 2_000).toISOString())
        .order("id", { ascending: true })
        .limit(4);
      const userM = (msgRows ?? []).find((m) => m.role === "user");
      const asstM = (msgRows ?? []).find((m) => m.role === "assistant");
      if (userM && asstM) {
        chatMessagePair = {
          userText: String(userM.content ?? ""),
          assistantText: String(asstM.content ?? ""),
          chatId: String(userM.chat_id ?? ""),
        };
      }
    }
    steps = reconstructLegacySteps({
      executionId,
      triggerType: String(ex.trigger_type),
      status: String(ex.status),
      startedAt: bounds.startedAt,
      finishedAt: bounds.finishedAt,
      durationMs: bounds.durationMs,
      errorCode: (ex.error_code as string | null) ?? null,
      errorMessage: (ex.error_message_safe as string | null) ?? null,
      botName: botRel?.name ?? null,
      botUsername: botRel?.telegram_username ?? null,
      agentModelName: agentModel?.name ?? null,
      agentImageModelName: agentImgModel?.name ?? null,
      aiCalls,
      chatMessagePair,
    });
  }

  const triggerPayload = (ex.trigger_payload as Record<string, unknown> | null) ?? null;
  const actor = extractActorFromPayload(triggerPayload);
  if (!actor.chatId && chatMessagePair?.chatId) actor.chatId = chatMessagePair.chatId;

  const triggerInfo = parseTriggerInfo(String(ex.trigger_type));
  const modelStep = [...steps].reverse().find((s) => s.phase === "model");
  const deliverySteps = steps.filter((s) => s.phase === "delivery" || s.nodeType === "telegram.fallback_sent");
  const telegramMessageIds: number[] = [];
  let deliveredMessages = 0;
  let queuedMessages = 0;
  let outputText: string | null = chatMessagePair?.assistantText ?? null;

  for (const ds of deliverySteps) {
    const out = ds.outputSummary ?? {};
    if (typeof out.messageId === "number") telegramMessageIds.push(out.messageId);
    if (Array.isArray(out.messageIds)) {
      for (const id of out.messageIds) if (typeof id === "number") telegramMessageIds.push(id);
    }
    if (typeof out.deliveredCount === "number") deliveredMessages += out.deliveredCount;
    else if (out.delivered === true || ds.status === "succeeded") deliveredMessages += 1;
    if (typeof out.queuedCount === "number") queuedMessages += out.queuedCount;
    else if (out.queued === true) queuedMessages += 1;
    if (!outputText && typeof out.replyPreview === "string" && out.replyPreview) outputText = out.replyPreview;
    if (!outputText && typeof out.caption === "string" && out.caption) outputText = out.caption;
  }
  if (!outputText && typeof modelStep?.outputSummary?.outputPreview === "string") {
    outputText = modelStep.outputSummary.outputPreview;
  }

  const inputText =
    (typeof triggerPayload?.text === "string" && triggerPayload.text) ||
    chatMessagePair?.userText ||
    (typeof steps[0]?.inputSummary?.text === "string" ? steps[0].inputSummary.text : null);

  const primaryAi = aiCalls[0];
  const promptTokens = aiCalls.reduce((n, c) => n + c.promptTokens, 0) || Number(modelStep?.outputSummary?.promptTokens ?? 0);
  const completionTokens = aiCalls.reduce((n, c) => n + c.completionTokens, 0) || Number(modelStep?.outputSummary?.completionTokens ?? 0);
  const totalTokens = aiCalls.reduce((n, c) => n + c.totalTokens, 0) || Number(modelStep?.outputSummary?.totalTokens ?? 0);
  const costUsd = aiCalls.reduce((n, c) => n + c.costUsd, 0);
  const modelUsed =
    primaryAi?.apiModelId ??
    (typeof modelStep?.outputSummary?.modelUsed === "string" ? modelStep.outputSummary.modelUsed : null) ??
    (typeof modelStep?.outputSummary?.modelName === "string" ? modelStep.outputSummary.modelName : null) ??
    null;
  const modelSlug =
    primaryAi?.modelSlug ??
    (typeof modelStep?.outputSummary?.modelSlug === "string" ? modelStep.outputSummary.modelSlug : null) ??
    null;
  const providerRaw =
    primaryAi?.source ??
    (typeof modelStep?.outputSummary?.source === "string" ? modelStep.outputSummary.source : null);

  return {
    execution: {
      id: String(ex.id),
      botId: (ex.bot_id as string | null) ?? null,
      botName: botRel?.name ?? null,
      botUsername: botRel?.telegram_username ?? null,
      agentId: (agentRow?.id as string | null) ?? null,
      agentName: (agentRow?.name as string | null) ?? null,
      agentModelName: agentModel?.name ?? null,
      agentImageModelName: agentImgModel?.name ?? null,
      workflowId: (ex.workflow_id as string | null) ?? null,
      workflowName: wfRel?.name ?? null,
      workflowVersion: (ex.workflow_version as number | null) ?? null,
      triggerType: String(ex.trigger_type),
      triggerLabel: triggerInfo.label,
      triggerCategory: triggerInfo.category,
      status: String(ex.status),
      startedAt: bounds.startedAt,
      finishedAt: bounds.finishedAt,
      durationMs: bounds.durationMs,
      errorCode: (ex.error_code as string | null) ?? null,
      errorMessage: (ex.error_message_safe as string | null) ?? null,
      idempotencyKey: (ex.idempotency_key as string | null) ?? null,
      triggerPayload,
    },
    actor,
    summary: {
      inputText,
      outputText,
      modelUsed,
      modelSlug,
      provider: providerRaw ? providerDisplayName(providerRaw) : null,
      totalTokens,
      promptTokens,
      completionTokens,
      costUsd,
      deliveredMessages,
      queuedMessages,
      telegramMessageIds,
    },
    traceSource,
    steps,
    aiCalls,
    phaseBreakdown: computePhaseBreakdown(steps, bounds.durationMs),
  };
}

/** Enriches a list of execution rows with step counts, model info, tokens, and actor previews for tables. */
export async function enrichExecutionSummaries(
  ctx: AuthContext,
  rows: Array<{
    id: string;
    bot_id: string | null;
    workflow_id: string | null;
    trigger_type: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    duration_ms: number | null;
    error_code: string | null;
    error_message_safe: string | null;
    trigger_payload: Record<string, unknown> | null;
    botName: string;
    botUsername: string | null;
    workflowName: string | null;
  }>,
  fallbackAgentUsage?: AiUsageRow[],
): Promise<ExecutionSummaryItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const [stepsRes, aiRes] = await Promise.all([
    ctx.supabase
      .from("execution_steps")
      .select("execution_id, node_type, output_summary")
      .eq("workspace_id", ctx.workspaceId)
      .in("execution_id", ids)
      .limit(2000),
    ctx.supabase
      .from("ai_usage_events")
      .select("execution_id, source, model_slug, api_model_id, total_tokens, cost_usd, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .in("execution_id", ids)
      .limit(500),
  ]);

  const stepMap = new Map<string, { count: number; model: string | null; source: "nvidia" | "vercel" | null; outputPreview: string | null; tokens: number }>();
  for (const s of stepsRes.data ?? []) {
    const eid = String(s.execution_id);
    const cur = stepMap.get(eid) ?? { count: 0, model: null, source: null, outputPreview: null, tokens: 0 };
    cur.count += 1;
    const out = (s.output_summary as Record<string, unknown> | null) ?? {};
    if (!cur.model && (typeof out.modelSlug === "string" || typeof out.modelUsed === "string" || typeof out.modelName === "string")) {
      cur.model = String(out.modelSlug ?? out.modelUsed ?? out.modelName);
    }
    if (!cur.source && (out.source === "nvidia" || out.source === "vercel")) cur.source = out.source;
    if (typeof out.totalTokens === "number") cur.tokens += out.totalTokens;
    if (!cur.outputPreview && typeof out.replyPreview === "string") cur.outputPreview = out.replyPreview.slice(0, 140);
    else if (!cur.outputPreview && typeof out.outputPreview === "string") cur.outputPreview = out.outputPreview.slice(0, 140);
    stepMap.set(eid, cur);
  }

  const aiMap = new Map<string, { model: string | null; source: "nvidia" | "vercel" | null; tokens: number; cost: number }>();
  for (const u of aiRes.data ?? []) {
    if (!u.execution_id) continue;
    const eid = String(u.execution_id);
    const cur = aiMap.get(eid) ?? { model: null, source: null, tokens: 0, cost: 0 };
    cur.model = cur.model ?? String(u.model_slug);
    cur.source = cur.source ?? (u.source === "vercel" ? "vercel" : "nvidia");
    cur.tokens += Number(u.total_tokens ?? 0);
    cur.cost += Number(u.cost_usd ?? 0) || 0;
    aiMap.set(eid, cur);
  }

  const legacyUsage = (fallbackAgentUsage ?? []).filter((u) => !u.execution_id);

  return rows.map((r) => {
    const bounds = normalizeExecutionBounds(r.started_at, r.finished_at, r.duration_ms);
    const info = parseTriggerInfo(r.trigger_type);
    const actor = extractActorFromPayload(r.trigger_payload);
    const st = stepMap.get(r.id);
    let ai = aiMap.get(r.id);

    if (!ai && r.bot_id && legacyUsage.length > 0) {
      const sMs = Date.parse(bounds.startedAt);
      const eMs = bounds.finishedAt ? Date.parse(bounds.finishedAt) : sMs + (bounds.durationMs ?? 0);
      const hits = legacyUsage.filter((u) => {
        const t = Date.parse(u.created_at);
        return Number.isFinite(t) && t >= sMs - 2_500 && t <= eMs + 2_500;
      });
      if (hits.length > 0) {
        ai = {
          model: hits[0]!.model_slug,
          source: hits[0]!.source === "vercel" ? "vercel" : "nvidia",
          tokens: hits.reduce((n, h) => n + Number(h.total_tokens ?? 0), 0),
          cost: hits.reduce((n, h) => n + (Number(h.cost_usd ?? 0) || 0), 0),
        };
      }
    }

    const rawText = typeof r.trigger_payload?.text === "string" ? r.trigger_payload.text : null;
    const cmdInput = typeof r.trigger_payload?.commandInput === "string" ? r.trigger_payload.commandInput : null;
    const inputPreview = cmdInput || rawText || (r.trigger_payload?.hasPhoto ? "Photo attachment" : null);

    return {
      id: r.id,
      botId: r.bot_id,
      botName: r.botName,
      botUsername: r.botUsername,
      workflowId: r.workflow_id,
      workflowName: r.workflowName,
      triggerType: r.trigger_type,
      triggerLabel: info.label,
      triggerCategory: info.category,
      status: r.status,
      startedAt: bounds.startedAt,
      finishedAt: bounds.finishedAt,
      durationMs: bounds.durationMs,
      errorCode: r.error_code,
      errorMessage: r.error_message_safe,
      inputPreview: inputPreview ? inputPreview.slice(0, 120) : null,
      outputPreview: st?.outputPreview ?? null,
      actorLabel: formatActorLabel(actor),
      chatId: actor.chatId,
      modelLabel: ai?.model ?? st?.model ?? null,
      providerSource: ai?.source ?? st?.source ?? null,
      totalTokens: ai?.tokens ?? st?.tokens ?? 0,
      costUsd: ai?.cost ?? 0,
      stepCount: st?.count ?? 0,
      hasRecordedSteps: (st?.count ?? 0) > 0,
    };
  });
}

/** Loads complete analytics, linked workflows, command stats, AI model breakdown, and enriched runs for one bot. */
export async function getBotAnalytics(
  ctx: AuthContext,
  botId: string,
  requestedRange: "7" | "30" | "all" = "30",
): Promise<BotAnalyticsPayload> {
  const bot = await getBot(ctx, botId);
  const days: number | "all" = requestedRange === "7" ? 7 : requestedRange === "30" ? 30 : "all";
  const since =
    days === "all"
      ? null
      : (() => {
          const d = new Date(Date.now() - (days - 1) * 86_400_000);
          d.setUTCHours(0, 0, 0, 0);
          return d;
        })();

  let execQuery = ctx.supabase
    .from("executions")
    .select("id, bot_id, workflow_id, trigger_type, status, started_at, finished_at, duration_ms, error_code, error_message_safe, trigger_payload, workflows(name)")
    .eq("workspace_id", ctx.workspaceId)
    .eq("bot_id", botId)
    .order("started_at", { ascending: false })
    .limit(1000);
  if (since) execQuery = execQuery.gte("started_at", since.toISOString());

  let aiQuery = ctx.supabase
    .from("ai_usage_events")
    .select("id, source, model_slug, api_model_id, kind, origin, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, provider_request_id, created_at, bot_id, execution_id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("origin", "agent")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (since) aiQuery = aiQuery.gte("created_at", since.toISOString());

  const [execRes, totalCountRes, wfRes, logRes, aiRes, usageStatsMap, intRes, hookRes, agentRes] = await Promise.all([
    execQuery,
    ctx.supabase.from("executions").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspaceId).eq("bot_id", botId),
    ctx.supabase.from("workflows").select("id, name, description, status, updated_at, definition").eq("workspace_id", ctx.workspaceId).order("updated_at", { ascending: false }).limit(100),
    ctx.supabase.from("activity_logs").select("id, action, detail, created_at").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(15),
    aiQuery,
    getBotUsageStats(ctx, [botId]),
    ctx.supabase
      .from("integrations")
      .select("id, provider, name, status, events, target_preview, last_tested_at, last_status, last_error, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    ctx.supabase
      .from("webhook_endpoints")
      .select("id, workflow_id, public_id, enabled, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    ctx.supabase
      .from("ai_agents")
      .select(
        "id, name, status, language, category, temperature, max_tokens, memory_turns, tools, instructions, ai_models!ai_agents_model_id_fkey(name), image_model:ai_models!ai_agents_image_model_id_fkey(name)",
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("bot_id", botId)
      .maybeSingle(),
  ]);

  const rawExecs = execRes.data ?? [];
  const totalExecutions = totalCountRes.count ?? rawExecs.length;
  const stats = usageStatsMap.get(botId) ?? { executionsCount: totalExecutions, activeUsers: 0 };

  // Filter workflows actually bound to this bot inside `definition.nodes[].config.botId`.
  const allWorkflows = wfRes.data ?? [];
  const wfById = new Map<string, { name: string; status: string }>();
  for (const w of allWorkflows) wfById.set(String(w.id), { name: String(w.name), status: String(w.status) });

  const workflows = allWorkflows
    .filter((w) => {
      const nodes = ((w.definition as { nodes?: { config?: { botId?: string } }[] } | null)?.nodes ?? []);
      return nodes.some((n) => n.config?.botId === botId);
    })
    .map((w) => ({
      id: String(w.id),
      name: String(w.name),
      description: String((w.description as string | null) ?? ""),
      status: String(w.status),
      updated_at: String(w.updated_at),
    }));

  const botWorkflowIds = new Set(workflows.map((w) => w.id));
  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const webhookEndpoints = (hookRes.data ?? [])
    .filter((h) => !botWorkflowIds.size || botWorkflowIds.has(String(h.workflow_id)))
    .map((h) => {
      const wf = wfById.get(String(h.workflow_id));
      return {
        id: String(h.id),
        workflowId: String(h.workflow_id),
        workflowName: wf?.name ?? "Automation",
        workflowStatus: wf?.status ?? "draft",
        url: `${appUrl}/api/webhooks/workflows/${String(h.public_id)}`,
        enabled: Boolean(h.enabled),
        createdAt: String(h.created_at),
      };
    });

  const integrations = (intRes.data ?? []).map((item) => ({
    id: String(item.id),
    provider: String(item.provider),
    name: String(item.name),
    status: String(item.status),
    events: Array.isArray(item.events) ? item.events.map(String) : [],
    targetPreview: (item.target_preview as string | null) ?? null,
    lastTestedAt: (item.last_tested_at as string | null) ?? null,
    lastStatus: (item.last_status as string | null) ?? null,
    lastError: (item.last_error as string | null) ?? null,
    createdAt: String(item.created_at),
  }));

  const agentRow = agentRes.data as Record<string, unknown> | null;
  let agentKnowledge: { id: string; title: string; content: string; createdAt: string }[] = [];
  if (agentRow?.id) {
    const { data: kRows } = await ctx.supabase
      .from("ai_agent_knowledge")
      .select("id, title, content, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .eq("agent_id", String(agentRow.id))
      .order("created_at", { ascending: true });
    agentKnowledge = (kRows ?? []).map((k) => ({
      id: String(k.id),
      title: String(k.title),
      content: String(k.content),
      createdAt: String(k.created_at),
    }));
  }

  const agent = agentRow
    ? {
        id: String(agentRow.id),
        name: String(agentRow.name),
        status: String(agentRow.status),
        language: String(agentRow.language ?? "English"),
        category: String(agentRow.category ?? ""),
        modelName: relJoin<{ name: string }>(agentRow.ai_models)?.name ?? null,
        imageModelName: relJoin<{ name: string }>(agentRow.image_model)?.name ?? null,
        temperature: Number(agentRow.temperature ?? 0.5),
        maxTokens: Number(agentRow.max_tokens ?? 1024),
        memoryTurns: Number(agentRow.memory_turns ?? 10),
        tools: parseTools(agentRow.tools),
        instructions: String(agentRow.instructions ?? ""),
      }
    : null;

  // Normalize bounds on all executions in the period.
  const normalized = rawExecs.map((e) => {
    const bounds = normalizeExecutionBounds(
      String(e.started_at),
      (e.finished_at as string | null) ?? null,
      (e.duration_ms as number | null) ?? null,
    );
    const wfRel = relJoin<{ name: string }>(e.workflows);
    return {
      id: String(e.id),
      bot_id: (e.bot_id as string | null) ?? botId,
      workflow_id: (e.workflow_id as string | null) ?? null,
      trigger_type: String(e.trigger_type),
      status: String(e.status),
      started_at: bounds.startedAt,
      finished_at: bounds.finishedAt,
      duration_ms: bounds.durationMs,
      error_code: (e.error_code as string | null) ?? null,
      error_message_safe: (e.error_message_safe as string | null) ?? null,
      trigger_payload: (e.trigger_payload as Record<string, unknown> | null) ?? null,
      botName: bot.name,
      botUsername: bot.username,
      workflowName: wfRel?.name ?? null,
    };
  });

  // Match AI usage events belonging directly to this bot OR correlated to this bot's legacy execution windows.
  const allAgentAi = (aiRes.data ?? []) as AiUsageRow[];
  const execWindows = normalized.map((e) => {
    const s = Date.parse(e.started_at);
    const f = e.finished_at ? Date.parse(e.finished_at) : s + (e.duration_ms ?? 0);
    return { id: e.id, start: s - 2_500, end: f + 2_500, trigger: e.trigger_type };
  });
  const botAiRows = allAgentAi.filter((u) => {
    if (u.bot_id === botId) return true;
    if (u.bot_id && u.bot_id !== botId) return false;
    const t = Date.parse(u.created_at);
    return Number.isFinite(t) && execWindows.some((w) => t >= w.start && t <= w.end);
  });

  // Daily chart buckets
  const chartDays = days === "all" ? 14 : days;
  const chartStart =
    days === "all"
      ? (() => {
          const oldest = normalized.length ? Date.parse(normalized[normalized.length - 1]!.started_at) : Date.now();
          const minStart = Date.now() - (chartDays - 1) * 86_400_000;
          const d = new Date(Math.min(oldest, minStart));
          d.setUTCHours(0, 0, 0, 0);
          return d;
        })()
      : since!;
  const spanDays = Math.min(30, Math.max(7, Math.ceil((Date.now() - chartStart.getTime()) / 86_400_000) + 1));
  const perDay = new Map<string, { total: number; succeeded: number; failed: number }>();
  for (let i = 0; i < spanDays; i++) {
    const key = new Date(chartStart.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    perDay.set(key, { total: 0, succeeded: 0, failed: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  const durations: number[] = [];
  const cmdMap = new Map<string, { trigger: string; count: number; succeeded: number; failed: number; durations: number[]; tokens: number }>();

  for (const e of normalized) {
    const day = e.started_at.slice(0, 10);
    const slot = perDay.get(day);
    if (slot) {
      slot.total += 1;
      if (e.status === "succeeded") slot.succeeded += 1;
      if (e.status === "failed") slot.failed += 1;
    }
    if (e.status === "succeeded") succeeded += 1;
    if (e.status === "failed") failed += 1;
    if (typeof e.duration_ms === "number") durations.push(e.duration_ms);

    const key = e.trigger_type || "unknown";
    const c = cmdMap.get(key) ?? { trigger: key, count: 0, succeeded: 0, failed: 0, durations: [], tokens: 0 };
    c.count += 1;
    if (e.status === "succeeded") c.succeeded += 1;
    if (e.status === "failed") c.failed += 1;
    if (typeof e.duration_ms === "number") c.durations.push(e.duration_ms);
    cmdMap.set(key, c);
  }

  // Attribute tokens to commands & models
  const modelMap = new Map<string, { slug: string; apiModelId: string | null; source: "nvidia" | "vercel"; kind: string; calls: number; tokens: number; promptTokens: number; completionTokens: number; latSum: number; latCount: number; costUsd: number }>();
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let aiCostUsd = 0;

  for (const u of botAiRows) {
    const tok = Number(u.total_tokens ?? 0);
    const pTok = Number(u.prompt_tokens ?? 0);
    const cTok = Number(u.completion_tokens ?? 0);
    const cost = Number(u.cost_usd ?? 0) || 0;
    totalTokens += tok;
    promptTokens += pTok;
    completionTokens += cTok;
    aiCostUsd += cost;

    const mKey = `${u.model_slug}:${u.kind}`;
    const cur = modelMap.get(mKey) ?? {
      slug: u.model_slug,
      apiModelId: u.api_model_id ?? null,
      source: u.source === "vercel" ? "vercel" : "nvidia",
      kind: u.kind,
      calls: 0,
      tokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      latSum: 0,
      latCount: 0,
      costUsd: 0,
    };
    cur.calls += 1;
    cur.tokens += tok;
    cur.promptTokens += pTok;
    cur.completionTokens += cTok;
    cur.costUsd += cost;
    if (typeof u.latency_ms === "number") {
      cur.latSum += u.latency_ms;
      cur.latCount += 1;
    }
    modelMap.set(mKey, cur);

    const matchWin = u.execution_id
      ? execWindows.find((w) => w.id === u.execution_id)
      : execWindows.find((w) => {
          const t = Date.parse(u.created_at);
          return Number.isFinite(t) && t >= w.start && t <= w.end;
        });
    if (matchWin) {
      const cmdEntry = cmdMap.get(matchWin.trigger);
      if (cmdEntry) cmdEntry.tokens += tok;
    }
  }

  const byCommand: CommandStatRow[] = [...cmdMap.values()]
    .map((c) => {
      const info = parseTriggerInfo(c.trigger);
      const avg = c.durations.length ? Math.round(c.durations.reduce((a, b) => a + b, 0) / c.durations.length) : 0;
      return {
        trigger: c.trigger,
        label: info.label,
        category: info.category,
        count: c.count,
        succeeded: c.succeeded,
        failed: c.failed,
        successRate: c.count ? Math.round((c.succeeded / c.count) * 100) : 0,
        avgDurationMs: avg,
        p95DurationMs: percentile(c.durations, 0.95),
        totalTokens: c.tokens,
      };
    })
    .sort((a, b) => b.count - a.count);

  const byModel: BotModelUsageRow[] = [...modelMap.values()]
    .map((m) => ({
      slug: m.slug,
      apiModelId: m.apiModelId,
      source: m.source,
      kind: m.kind,
      calls: m.calls,
      tokens: m.tokens,
      promptTokens: m.promptTokens,
      completionTokens: m.completionTokens,
      avgLatencyMs: m.latCount ? Math.round(m.latSum / m.latCount) : 0,
      costUsd: m.costUsd,
    }))
    .sort((a, b) => b.calls - a.calls);

  const enrichedExecutions = await enrichExecutionSummaries(ctx, normalized.slice(0, 80), botAiRows);

  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", spanDays > 7 ? { month: "short", day: "numeric", timeZone: "UTC" } : { weekday: "short", timeZone: "UTC" });

  const durationSum = durations.reduce((a, b) => a + b, 0);

  const summaryObj = {
    totalExecutions,
    periodExecutions: normalized.length,
    succeeded,
    failed,
    successRate: normalized.length ? Math.round((succeeded / normalized.length) * 100) : 100,
    avgDurationMs: durations.length ? Math.round(durationSum / durations.length) : 0,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    minDurationMs: durations.length ? Math.min(...durations) : 0,
    maxDurationMs: durations.length ? Math.max(...durations) : 0,
    messagesCount: Math.max(bot.messagesCount, totalExecutions),
    activeUsers: stats.activeUsers,
    aiCalls: botAiRows.length,
    totalTokens,
    promptTokens,
    completionTokens,
    aiCostUsd,
  };

  return {
    days,
    summary: summaryObj,
    stats: {
      messages: summaryObj.messagesCount,
      activeUsers: summaryObj.activeUsers,
      executionsTotal: summaryObj.totalExecutions,
      executionsSucceeded: summaryObj.succeeded,
      executionsFailed: summaryObj.failed,
      avgDurationMs: summaryObj.avgDurationMs,
      aiRequests: summaryObj.aiCalls,
      aiTokensTotal: summaryObj.totalTokens,
    },
    trend: [...perDay].map(([d, v]) => ({ day: fmtDay(d), value: v.total })),
    dailyStatus: [...perDay].map(([d, v]) => ({ day: fmtDay(d), succeeded: v.succeeded, failed: v.failed })),
    byCommand,
    byModel,
    executions: enrichedExecutions,
    workflows,
    integrations,
    webhookEndpoints,
    agent,
    agentKnowledge,
    logs: (logRes.data ?? []).map((l) => ({
      id: String(l.id),
      action: String(l.action),
      detail: (l.detail as string | null) ?? null,
      created_at: String(l.created_at),
    })),
  };
}

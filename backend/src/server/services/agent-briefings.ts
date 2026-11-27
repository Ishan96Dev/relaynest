import "server-only";
import { z } from "zod";
import { isValidCron, isValidTimezone } from "@backend/lib/cron";
import { Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { buildSystemPrompt } from "@backend/server/ai/agent";
import { formatTelegramHtmlChunks, formatTelegramPlainChunks, pickFeaturedLinkPreviewUrl } from "@backend/server/ai/citations";
import { chat } from "@backend/server/ai/provider";
import { withUsageScope } from "@backend/server/ai/usage";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { assertExecutionLimit } from "@backend/server/billing/entitlements";
import { runAgenticTools } from "@backend/server/services/agentic-runner";
import { AGENT_COLUMNS, toAgentConfig } from "@backend/server/services/ai-agents";
import { getDbFastChatModel } from "@backend/server/services/ai-models";
import { createAutomation, publishAutomation, saveAutomation, unpublishAutomation } from "@backend/server/services/automations";
import { loadToken } from "@backend/server/services/bots";
import { dispatchTelegramFormattedMessages } from "@backend/server/telegram/outbound";
import type { WorkflowDefinition } from "@backend/server/workflow-engine";

export const agentBriefingInput = z.object({
  enabled: z.boolean(),
  cron: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidCron, "Use 5 cron fields: minute hour day month weekday (e.g. 0 9 * * 1-5)."),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimezone, "Use an IANA timezone such as Asia/Kolkata or UTC.")
    .default("Asia/Kolkata"),
  chatId: z.string().trim().min(1, "Enter the Telegram Chat ID or Channel ID.").max(64),
  prompt: z.string().trim().min(10, "Describe what the daily briefing should research.").max(3000),
  includeWebSearch: z.boolean().default(true),
  includeMarketData: z.boolean().default(true),
});
export type AgentBriefingInput = z.infer<typeof agentBriefingInput>;

export const sendBriefingNowInput = z.object({
  chatId: z.string().trim().min(1, "Enter the Telegram Chat ID to deliver the test briefing.").max(64),
  prompt: z.string().trim().min(5).max(3000).optional(),
  includeWebSearch: z.boolean().default(true),
  includeMarketData: z.boolean().default(true),
});

export interface AgentBriefingDto {
  workflowId: string | null;
  enabled: boolean;
  cron: string;
  timezone: string;
  chatId: string;
  prompt: string;
  includeWebSearch: boolean;
  includeMarketData: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  recentChatIds: string[];
}

interface LinkedWf {
  id: string;
  status: string;
  definition: WorkflowDefinition;
}

async function findLinkedBriefingWorkflow(ctx: AuthContext, agentId: string): Promise<LinkedWf | null> {
  const { data } = await ctx.supabase
    .from("workflows")
    .select("id, status, definition")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);

  for (const row of data ?? []) {
    const def = row.definition as WorkflowDefinition | null;
    if (!def?.nodes) continue;
    const match = def.nodes.find(
      (n) => n.type === "action.ai.research" && (n.config as { agentId?: string })?.agentId === agentId,
    );
    if (match) {
      return { id: row.id as string, status: row.status as string, definition: def };
    }
  }
  return null;
}

async function loadRecentChatIds(workspaceId: string, agentId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("ai_agent_messages")
    .select("chat_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .order("id", { ascending: false })
    .limit(40);
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const id = String(r.chat_id ?? "").trim();
    if (id && !seen.has(id)) seen.add(id);
    if (seen.size >= 6) break;
  }
  return Array.from(seen);
}

/** Loads the Daily Briefing schedule linked to an AI agent (if configured), plus recent Telegram chat IDs. */
export async function getAgentBriefing(ctx: AuthContext, agentId: string): Promise<AgentBriefingDto> {
  const [{ data: agentRow }, wf, recentChatIds] = await Promise.all([
    ctx.supabase.from("ai_agents").select("id, name, category").eq("id", agentId).eq("workspace_id", ctx.workspaceId).maybeSingle(),
    findLinkedBriefingWorkflow(ctx, agentId),
    loadRecentChatIds(ctx.workspaceId, agentId),
  ]);
  if (!agentRow) throw Errors.notFound("AI agent");

  if (!wf) {
    return {
      workflowId: null,
      enabled: false,
      cron: "0 9 * * 1-5",
      timezone: "Asia/Kolkata",
      chatId: recentChatIds[0] ?? "",
      prompt: "",
      includeWebSearch: true,
      includeMarketData: agentRow.category === "Finance & Markets",
      nextRunAt: null,
      lastRunAt: null,
      lastStatus: null,
      recentChatIds,
    };
  }

  const schedNode = wf.definition.nodes.find((n) => n.type === "trigger.schedule");
  const aiNode = wf.definition.nodes.find((n) => n.type === "action.ai.research");
  const tgNode = wf.definition.nodes.find((n) => n.type === "action.telegram.sendMessage");

  const { data: sched } = await ctx.supabase
    .from("workflow_schedules")
    .select("cron, timezone, enabled, next_run_at, last_run_at, last_status")
    .eq("workflow_id", wf.id)
    .maybeSingle();

  const sc = (schedNode?.config ?? {}) as { cron?: string; timezone?: string };
  const ac = (aiNode?.config ?? {}) as { prompt?: string; includeWebSearch?: boolean; includeMarketData?: boolean };
  const tc = (tgNode?.config ?? {}) as { chatId?: string };

  return {
    workflowId: wf.id,
    enabled: Boolean(sched?.enabled ?? wf.status === "active"),
    cron: (sched?.cron as string) || sc.cron || "0 9 * * 1-5",
    timezone: (sched?.timezone as string) || sc.timezone || "Asia/Kolkata",
    chatId: tc.chatId || recentChatIds[0] || "",
    prompt: ac.prompt || "",
    includeWebSearch: ac.includeWebSearch !== false,
    includeMarketData: ac.includeMarketData !== false,
    nextRunAt: (sched?.next_run_at as string | null) ?? null,
    lastRunAt: (sched?.last_run_at as string | null) ?? null,
    lastStatus: (sched?.last_status as string | null) ?? null,
    recentChatIds,
  };
}

/** Creates or updates a scheduled Daily Briefing workflow linked to an AI agent. */
export async function upsertAgentBriefing(ctx: AuthContext, agentId: string, input: AgentBriefingInput): Promise<AgentBriefingDto> {
  requireWrite(ctx);
  const { data: agentRow } = await ctx.supabase
    .from("ai_agents")
    .select(AGENT_COLUMNS)
    .eq("id", agentId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!agentRow) throw Errors.notFound("AI agent");

  const botId = agentRow.bot_id as string | null;
  if (!botId) throw Errors.invalid("Connect a Telegram bot to this AI agent first (Step 1).");
  const cfg = toAgentConfig(agentRow, ctx.workspaceId);

  const definition: WorkflowDefinition = {
    version: 1,
    nodes: [
      { id: "trigger_1", type: "trigger.schedule", position: { x: 260, y: 20 }, config: { cron: input.cron, timezone: input.timezone } },
      {
        id: "act_ai_1",
        type: "action.ai.research",
        position: { x: 260, y: 190 },
        config: {
          agentId: cfg.id,
          category: cfg.category,
          ...(cfg.model?.slug ? { modelSlug: cfg.model.slug } : {}),
          prompt: input.prompt,
          includeWebSearch: input.includeWebSearch,
          includeMarketData: input.includeMarketData,
        },
      },
      {
        id: "act_tg_1",
        type: "action.telegram.sendMessage",
        position: { x: 260, y: 370 },
        config: {
          botId,
          chatIdSource: "configured",
          chatId: input.chatId,
          text: "{{ai.text}}",
        },
      },
    ],
    edges: [
      { id: "e_sched_ai", source: "trigger_1", target: "act_ai_1" },
      { id: "e_ai_tg", source: "act_ai_1", target: "act_tg_1" },
    ],
  };

  const name = `${cfg.name} — Daily Briefing`.slice(0, 80);
  const handle = typeof agentRow.username === "string" && agentRow.username.trim()
    ? `@${agentRow.username.trim()}`
    : cfg.name;
  const description = `Automated ${input.cron} (${input.timezone}) Telegram briefing for ${handle}.`.slice(0, 200);

  const existing = await findLinkedBriefingWorkflow(ctx, agentId);
  let workflowId: string;

  if (existing) {
    // Published workflow definitions are immutable in Postgres (block_published_edit trigger), so unpublish first.
    if (existing.status === "active") {
      await unpublishAutomation(ctx, existing.id);
    }
    const saved = await saveAutomation(ctx, existing.id, { name, description, definition });
    workflowId = saved.id;
  } else {
    const created = await createAutomation(ctx, { name, description, definition });
    workflowId = created.id;
  }

  if (input.enabled) {
    await publishAutomation(ctx, workflowId);
  }

  return getAgentBriefing(ctx, agentId);
}

/** Runs the agent's live briefing immediately and delivers it to Telegram (great for verifying setup). */
export async function sendAgentBriefingNow(
  ctx: AuthContext,
  agentId: string,
  input: z.infer<typeof sendBriefingNowInput>,
): Promise<{ deliveredCount: number; quotesCount: number; sourcesCount: number; preview: string; ms: number }> {
  requireWrite(ctx);
  await assertExecutionLimit(ctx.workspaceId);
  const started = Date.now();
  const { data: agentRow } = await ctx.supabase
    .from("ai_agents")
    .select(AGENT_COLUMNS)
    .eq("id", agentId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!agentRow) throw Errors.notFound("AI agent");

  const botId = agentRow.bot_id as string | null;
  if (!botId) throw Errors.invalid("Connect a Telegram bot first (Step 1).");
  const cfg = toAgentConfig(agentRow, ctx.workspaceId);
  const model = cfg.model ?? (await getDbFastChatModel());
  if (!model) throw Errors.invalid("Choose an AI model for this agent first (Step 3).");

  const prompt = input.prompt?.trim() || `Daily ${cfg.category} briefing today`;

  return withUsageScope({ workspaceId: ctx.workspaceId, userId: ctx.userId, origin: "agent", botId }, async () => {
    const agentic = await runAgenticTools({
      message: prompt,
      command: { command: "brief", kind: "brief", instruction: prompt },
      autoSearch: input.includeWebSearch,
      marketData: input.includeMarketData,
      forceWebSearch: input.includeWebSearch,
      agentCategory: cfg.category,
      maxResults: 6,
      maxImages: 0,
      maxVideos: 0,
    });

    const system = [buildSystemPrompt(cfg, [], new Date(), []), agentic.systemContext].filter(Boolean).join("\n\n");
    const r = await chat(
      model,
      [
        { role: "system", content: system },
        { role: "user", content: prompt.slice(0, 3000) },
      ],
      {
        temperature: Math.min(cfg.temperature, 0.35),
        maxTokens: 2048,
        thinking: false,
        timeoutMs: 22_000,
        allowFallback: true,
      },
    );

    const token = await loadToken(botId, ctx.workspaceId);
    const htmlChunks = formatTelegramHtmlChunks(r.text, agentic.citations);
    const plainChunks = formatTelegramPlainChunks(r.text, agentic.citations);
    const previewUrl = pickFeaturedLinkPreviewUrl(r.text, agentic.citations);
    const sent = await dispatchTelegramFormattedMessages({
      botId,
      workspaceId: ctx.workspaceId,
      token,
      chatId: input.chatId,
      htmlChunks,
      plainChunks,
      linkPreviewUrl: previewUrl,
    });

    return {
      deliveredCount: sent.deliveredCount,
      quotesCount: agentic.marketSnapshot?.quotes.length ?? 0,
      sourcesCount: agentic.citations.length,
      preview: r.text.slice(0, 800),
      ms: Date.now() - started,
    };
  });
}


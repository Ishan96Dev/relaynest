import "server-only";
import { publicEnv } from "@backend/lib/env/public";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { buildSystemPrompt } from "@backend/server/ai/agent";
import { formatTelegramHtmlChunks, formatTelegramPlainChunks, pickFeaturedLinkPreviewUrl } from "@backend/server/ai/citations";
import { chat } from "@backend/server/ai/provider";
import { withUsageScope } from "@backend/server/ai/usage";
import { executionAllowed } from "@backend/server/billing/entitlements";
import { automationFailedEmail } from "@backend/server/email/templates";
import { notify, notifyOwners } from "@backend/server/notifications";
import { runAgenticTools } from "@backend/server/services/agentic-runner";
import { AGENT_COLUMNS, toAgentConfig } from "@backend/server/services/ai-agents";
import { getDbFastChatModel } from "@backend/server/services/ai-models";
import { loadToken } from "@backend/server/services/bots";
import { dispatchTelegramFormattedMessages, dispatchTelegramMessage } from "@backend/server/telegram/outbound";
import { executeWorkflow, workflowDefinitionSchema, type ActionAdapters, type ExecutionResult } from "@backend/server/workflow-engine";
export type TriggerKind = "schedule" | "webhook" | "telegram" | "manual";
export interface RunRequest {
  workflowId: string;
  trigger: TriggerKind;
  payload: Record<string, unknown>;
  /** Makes a delivery safe to retry: the same key never produces a second run. */
  idempotencyKey?: string;
}
export type RunOutcome =
  | { outcome: "ran"; executionId: string; result: ExecutionResult }
  | { outcome: "skipped"; reason: "inactive" | "plan_limit" | "duplicate" | "invalid" };
/** Real action adapters for one workspace. Bot IDs are checked against the workspace so a workflow cannot use another tenant's bot. */
function adapters(workspaceId: string): ActionAdapters {
  let lastAiCitations: Awaited<ReturnType<typeof runAgenticTools>>["citations"] = [];
  return {
    async sendTelegramMessage({ botId, chatId, text, idempotencyKey }) {
      const token = await loadToken(botId, workspaceId);
      const looksFormatted = lastAiCitations.length > 0 || text.length > 3600 || /(\*\*|^###?\s|\|.*\|.*\|)/m.test(text);
      if (looksFormatted) {
        const htmlChunks = formatTelegramHtmlChunks(text, lastAiCitations);
        const plainChunks = formatTelegramPlainChunks(text, lastAiCitations);
        const previewUrl = pickFeaturedLinkPreviewUrl(text, lastAiCitations);
        const r = await dispatchTelegramFormattedMessages({
          botId,
          workspaceId,
          token,
          chatId,
          htmlChunks,
          plainChunks,
          linkPreviewUrl: previewUrl,
        });
        return {
          externalMessageId:
            r.messageIds[0] !== undefined ? String(r.messageIds[0]) : r.queuedCount > 0 ? "queued" : undefined,
        };
      }
      const r = await dispatchTelegramMessage({
        botId,
        workspaceId,
        token,
        chatId,
        kind: "text",
        text,
        idempotencyKey,
      });
      return {
        externalMessageId:
          r.messageId !== undefined ? String(r.messageId) : r.queued ? "queued" : undefined,
      };
    },
    async httpRequest({ method, url, body }) {
      // Redirects are not followed: the SSRF check covered the original URL only.
      const res = await fetch(url, {
        method, body: method === "GET" ? undefined : body, redirect: "manual", signal: AbortSignal.timeout(10_000),
        headers: body ? { "content-type": "application/json", "user-agent": "RelayNest-Automations/1.0" } : { "user-agent": "RelayNest-Automations/1.0" },
      });
      return { status: res.status };
    },
    async runAiResearch({ prompt, systemPrompt, agentId, category, modelSlug, includeWebSearch, includeMarketData }) {
      return withUsageScope({ workspaceId, origin: "agent" }, async () => {
        const db = createAdminClient();
        let agentSystem = systemPrompt?.trim() || "";
        let resolvedCategory = category;
        let model = null;

        if (agentId) {
          const { data: agentRow } = await db
            .from("ai_agents")
            .select(AGENT_COLUMNS)
            .eq("id", agentId)
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          if (agentRow) {
            const cfg = toAgentConfig(agentRow, workspaceId);
            if (!agentSystem) agentSystem = buildSystemPrompt(cfg, [], new Date(), []);
            if (!resolvedCategory) resolvedCategory = cfg.category;
            model = cfg.model;
          }
        }
        if (!model && modelSlug) {
          const { data: mRow } = await db
            .from("ai_models")
            .select("slug, source, api_model_id, is_thinking, is_active, fallback_model_slug, endpoint_path")
            .eq("slug", modelSlug)
            .maybeSingle();
          if (mRow) {
            model = {
              slug: mRow.slug as string,
              source: mRow.source as "nvidia" | "vercel",
              apiModelId: mRow.api_model_id as string,
              isThinking: Boolean(mRow.is_thinking),
              isActive: mRow.is_active as boolean | undefined,
              fallbackModelSlug: (mRow.fallback_model_slug as string | null) ?? null,
              endpointPath: (mRow.endpoint_path as string | null) ?? null,
            };
          }
        }
        if (!model) {
          model = await getDbFastChatModel();
        }
        if (!model) {
          throw Object.assign(new Error("No active AI model available for workflow research."), { code: "NO_MODEL" });
        }

        const agentic = await runAgenticTools({
          message: prompt,
          command: { command: "brief", kind: "brief", instruction: prompt },
          autoSearch: includeWebSearch,
          marketData: includeMarketData,
          forceWebSearch: includeWebSearch,
          agentCategory: resolvedCategory,
          maxResults: 6,
          maxImages: 0,
          maxVideos: 0,
        });
        lastAiCitations = agentic.citations;

        const baseSystem =
          agentSystem ||
          `You are a RelayNest Agentic Daily Briefing assistant${resolvedCategory ? ` (${resolvedCategory})` : ""}. Produce a crisp, scannable, mobile-friendly Telegram briefing with Markdown headings, bullet highlights, structured tables for prices/metrics, and inline source citations [1]. Current UTC time: ${new Date().toISOString().slice(0, 16).replace("T", " ")}.`;
        const fullSystem = [baseSystem, agentic.systemContext].filter(Boolean).join("\n\n");

        const r = await chat(
          model,
          [
            { role: "system", content: fullSystem },
            { role: "user", content: prompt.slice(0, 3000) },
          ],
          {
            temperature: 0.3,
            maxTokens: 2048,
            thinking: false,
            timeoutMs: 22_000,
            allowFallback: true,
          },
        );
        return {
          text: r.text,
          sourcesCount: agentic.citations.length,
          quotesCount: agentic.marketSnapshot?.quotes.length ?? 0,
          modelUsed: r.modelUsed ?? model.apiModelId,
        };
      });
    },
  };
}
/** Runs a published workflow once and stores the execution with its steps. Never throws for a failed workflow; the result says what happened. */
export async function runWorkflow(req: RunRequest): Promise<RunOutcome> {
  const db = createAdminClient();
  const { data: wf } = await db.from("workflows").select("id, workspace_id, name, version, status, definition, agent_id").eq("id", req.workflowId).maybeSingle();
  if (!wf || wf.status !== "active") return { outcome: "skipped", reason: "inactive" };
  const workspaceId = wf.workspace_id as string;
  const parsed = workflowDefinitionSchema.safeParse(wf.definition);
  if (!parsed.success) return { outcome: "skipped", reason: "invalid" };
  if (!(await executionAllowed(workspaceId))) return { outcome: "skipped", reason: "plan_limit" };
  const started = Date.now();
  const { data: exec, error } = await db.from("executions").insert({
    workspace_id: workspaceId, workflow_id: wf.id, workflow_version: wf.version, trigger_type: req.trigger, status: "running",
    started_at: new Date(started).toISOString(),
    idempotency_key: req.idempotencyKey ?? null, trigger_payload: req.payload,
  }).select("id").single();
  if (error) return { outcome: "skipped", reason: error.code === "23505" ? "duplicate" : "invalid" };
  let result: ExecutionResult;
  try {
    result = await executeWorkflow(
      parsed.data,
      { type: req.trigger, workspaceId, source: req.trigger, occurredAt: new Date().toISOString(), payload: req.payload },
      adapters(workspaceId),
      { executionId: exec.id as string },
    );
  } catch {
    result = { status: "failed", steps: [{ nodeId: "-", nodeType: "workflow", status: "failed", errorCode: "ENGINE_ERROR", errorMessageSafe: "The workflow engine failed." }] };
  }
  const failedStep = result.steps.find((s) => s.status === "failed");
  await Promise.all([
    db.from("executions").update({
      status: result.status, finished_at: new Date().toISOString(), duration_ms: Date.now() - started,
      error_code: failedStep?.errorCode ?? null, error_message_safe: failedStep?.errorMessageSafe ?? null,
    }).eq("id", exec.id),
    result.steps.length
      ? db.from("execution_steps").insert(result.steps.map((s, idx) => ({
        workspace_id: workspaceId,
        execution_id: exec.id,
        step_order: idx + 1,
        node_id: s.nodeId,
        node_type: s.nodeType,
        status: s.status,
        started_at: s.startedAt ?? null,
        finished_at: s.finishedAt ?? null,
        duration_ms: s.durationMs ?? null,
        input_summary: s.inputSummary ?? null,
        output_summary: s.outputSummary ?? null,
        error_code: s.errorCode ?? null,
        error_message_safe: s.errorMessageSafe ?? null,
      })))
      : Promise.resolve(),
  ]);
  if (result.status === "failed") {
    await notifyFailure(workspaceId, String(wf.name), failedStep?.errorMessageSafe ?? "The automation failed.");
  } else if (req.trigger === "schedule") {
    await notifyOwners(workspaceId, {
      kind: "automation_succeeded",
      title: `Scheduled automation completed: ${String(wf.name)}`,
      body: `Finished ${result.steps.length} step(s) in ${Date.now() - started}ms.`,
      dedupeHours: 0.05,
      dedupeByTitle: true,
    });
  }
  return { outcome: "ran", executionId: exec.id as string, result };
}
const lastAlert = new Map<string, number>();
/** Tells workspace owners, in-app and by email, honoring user_settings.notifications. */
async function notifyFailure(workspaceId: string, name: string, reason: string) {
  const key = `${workspaceId}:${name}`;
  if (Date.now() - (lastAlert.get(key) ?? 0) < 3_600_000) return;
  lastAlert.set(key, Date.now());
  try {
    const db = createAdminClient();
    const { data: owners } = await db
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .in("role", ["owner", "admin"]);
    if (!owners?.length) return;
    const mail = automationFailedEmail({ name, error: reason, appUrl: publicEnv().NEXT_PUBLIC_APP_URL });
    await Promise.all(
      owners.map((m) =>
        notify({
          workspaceId,
          userId: m.user_id as string,
          kind: "execution_failed",
          title: `Automation failed: ${name}`,
          body: reason,
          emailKey: "automationFailures",
          emailPayload: { ...mail, tags: ["automation", "execution_failed"] },
          dedupeHours: 1,
          dedupeByTitle: true,
        }),
      ),
    );
  } catch {
    console.error("[automations] could not send the failure notification");
  }
}

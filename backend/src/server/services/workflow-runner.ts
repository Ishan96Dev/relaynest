import "server-only";
import { publicEnv } from "@backend/lib/env/public";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { executionAllowed } from "@backend/server/billing/entitlements";
import { sendEmail } from "@backend/server/email/mailer";
import { automationFailedEmail } from "@backend/server/email/templates";
import { loadToken } from "@backend/server/services/bots";
import { sendMessage } from "@backend/server/telegram/client";
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
  return {
    async sendTelegramMessage({ botId, chatId, text }) {
      const token = await loadToken(botId, workspaceId);
      const r = (await sendMessage(token, chatId, text)) as { message_id?: number } | undefined;
      return { externalMessageId: r?.message_id !== undefined ? String(r.message_id) : undefined };
    },
    async httpRequest({ method, url, body }) {
      // Redirects are not followed: the SSRF check covered the original URL only.
      const res = await fetch(url, {
        method, body: method === "GET" ? undefined : body, redirect: "manual", signal: AbortSignal.timeout(10_000),
        headers: body ? { "content-type": "application/json", "user-agent": "RelayNest-Automations/1.0" } : { "user-agent": "RelayNest-Automations/1.0" },
      });
      return { status: res.status };
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
      ? db.from("execution_steps").insert(result.steps.map((s) => ({
        workspace_id: workspaceId, execution_id: exec.id, node_id: s.nodeId, node_type: s.nodeType, status: s.status,
        output_summary: s.outputSummary ?? null, error_code: s.errorCode ?? null, error_message_safe: s.errorMessageSafe ?? null,
      })))
      : Promise.resolve(),
  ]);
  if (result.status === "failed") await notifyFailure(workspaceId, String(wf.name), failedStep?.errorMessageSafe ?? "The automation failed.");
  return { outcome: "ran", executionId: exec.id as string, result };
}
const lastAlert = new Map<string, number>();
/** Tells the workspace owner, in-app and by email, unless they switched those notifications off in Settings. */
async function notifyFailure(workspaceId: string, name: string, reason: string) {
  const key = `${workspaceId}:${name}`;
  if (Date.now() - (lastAlert.get(key) ?? 0) < 3_600_000) return;
  lastAlert.set(key, Date.now());
  try {
    const db = createAdminClient();
    const { data: owner } = await db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
    if (!owner) return;
    const userId = owner.user_id as string;
    // A schedule that fails every minute must not send a message every minute: one alert per automation per hour.
    const { data: recent } = await db.from("notifications").select("id").eq("workspace_id", workspaceId).eq("kind", "execution_failed")
      .eq("title", `Automation failed: ${name}`).gte("created_at", new Date(Date.now() - 3_600_000).toISOString()).limit(1);
    if (recent?.length) return;
    const { data: s } = await db.from("user_settings").select("value").eq("user_id", userId).eq("key", "notifications").maybeSingle();
    const prefs = (s?.value ?? {}) as { automationFailures?: boolean; executionFailures?: boolean };
    if (prefs.executionFailures !== false) {
      await db.from("notifications").insert({ workspace_id: workspaceId, user_id: userId, kind: "execution_failed", title: `Automation failed: ${name}`, body: reason });
    }
    if (prefs.automationFailures !== false) {
      const { data: u } = await db.auth.admin.getUserById(userId);
      if (u.user?.email) await sendEmail({ to: { email: u.user.email }, ...automationFailedEmail({ name, error: reason, appUrl: publicEnv().NEXT_PUBLIC_APP_URL }), tags: ["automation"] });
    }
  } catch {
    console.error("[automations] could not send the failure notification");
  }
}

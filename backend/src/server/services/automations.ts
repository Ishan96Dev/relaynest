import "server-only";
import { z } from "zod";
import { nextRun } from "@backend/lib/cron";
import { randomToken, sha256Hex } from "@backend/lib/crypto";
import { publicEnv } from "@backend/lib/env/public";
import { Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { notify } from "@backend/server/notifications";
import { validateWorkflow, workflowDefinitionSchema, type WorkflowDefinition } from "@backend/server/workflow-engine";
export const automationInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).default(""),
  definition: workflowDefinitionSchema,
});
export type AutomationInput = z.infer<typeof automationInput>;
export interface AutomationDto {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  version: number;
  publishedAt: string | null;
  definition: WorkflowDefinition;
  webhook: { url: string; enabled: boolean } | null;
  schedule: { cron: string; timezone: string; enabled: boolean; nextRunAt: string | null; lastRunAt: string | null; lastStatus: string | null } | null;
  /** Runs of the last 30 days. */
  runs: { succeeded: number; failed: number };
}
const COLS = "id, agent_id, name, description, status, version, published_at, definition";
interface WfRow { id: string; agent_id: string; name: string; description: string | null; status: string; version: number; published_at: string | null; definition: unknown }
async function load(ctx: AuthContext, id: string): Promise<WfRow> {
  const { data } = await ctx.supabase.from("workflows").select(COLS).eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (!data) throw Errors.notFound("Automation");
  return data as WfRow;
}
const hookUrl = (publicId: string) => `${publicEnv().NEXT_PUBLIC_APP_URL}/api/webhooks/workflows/${publicId}`;
async function toDto(ctx: AuthContext, r: WfRow): Promise<AutomationDto> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [sched, hook, ok, bad] = await Promise.all([
    ctx.supabase.from("workflow_schedules").select("cron, timezone, enabled, next_run_at, last_run_at, last_status").eq("workflow_id", r.id).maybeSingle(),
    ctx.supabase.from("webhook_endpoints").select("public_id, enabled").eq("workflow_id", r.id).maybeSingle(),
    ctx.supabase.from("executions").select("id", { count: "exact", head: true }).eq("workflow_id", r.id).eq("status", "succeeded").gte("started_at", since),
    ctx.supabase.from("executions").select("id", { count: "exact", head: true }).eq("workflow_id", r.id).eq("status", "failed").gte("started_at", since),
  ]);
  const s = sched.data as { cron: string; timezone: string; enabled: boolean; next_run_at: string | null; last_run_at: string | null; last_status: string | null } | null;
  return {
    id: r.id, name: r.name, description: r.description ?? "", status: r.status as AutomationDto["status"], version: r.version, publishedAt: r.published_at,
    definition: r.definition as WorkflowDefinition,
    webhook: hook.data ? { url: hookUrl(hook.data.public_id as string), enabled: Boolean(hook.data.enabled) } : null,
    schedule: s ? { cron: s.cron, timezone: s.timezone, enabled: s.enabled, nextRunAt: s.next_run_at, lastRunAt: s.last_run_at, lastStatus: s.last_status } : null,
    runs: { succeeded: ok.count ?? 0, failed: bad.count ?? 0 },
  };
}
export async function getAutomation(ctx: AuthContext, id: string): Promise<AutomationDto> {
  return toDto(ctx, await load(ctx, id));
}
export async function createAutomation(ctx: AuthContext, input: AutomationInput): Promise<AutomationDto> {
  requireWrite(ctx);
  const { data: agent, error } = await ctx.supabase.from("agents")
    .insert({ workspace_id: ctx.workspaceId, name: input.name, description: input.description || null, created_by: ctx.userId }).select("id").single();
  if (error) throw new Error("Failed to create the automation");
  const { data: wf, error: wfErr } = await ctx.supabase.from("workflows")
    .insert({ workspace_id: ctx.workspaceId, agent_id: agent.id, name: input.name, description: input.description || null, definition: input.definition }).select(COLS).single();
  if (wfErr) {
    await ctx.supabase.from("agents").delete().eq("id", agent.id);
    throw new Error("Failed to create the automation");
  }
  await createAdminClient().from("activity_logs").insert({ workspace_id: ctx.workspaceId, actor_id: ctx.userId, action: "automation.created", detail: input.name });
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "automation_created",
    title: `Automation created: ${input.name}`,
    body: "Saved as a draft. Publish it when you're ready to start running triggers.",
    actionUrl: `/workflows/${wf.id as string}`,
  });
  return toDto(ctx, wf as WfRow);
}
/**
 * Saves edits. A published automation goes back to draft and stops running until it is published again,
 * so a half-edited graph never runs.
 */
export async function saveAutomation(ctx: AuthContext, id: string, input: AutomationInput): Promise<AutomationDto> {
  requireWrite(ctx);
  const cur = await load(ctx, id);
  const { data, error } = await ctx.supabase.from("workflows")
    .update({ name: input.name, description: input.description || null, definition: input.definition, status: "draft", published_at: null })
    .eq("id", id).eq("workspace_id", ctx.workspaceId).select(COLS).single();
  if (error) throw new Error("Failed to save the automation");
  await ctx.supabase.from("agents").update({ name: input.name, description: input.description || null, status: "draft" }).eq("id", cur.agent_id).eq("workspace_id", ctx.workspaceId);
  if (cur.status === "active") await pause(id);
  return toDto(ctx, data as WfRow);
}
async function pause(workflowId: string) {
  const db = createAdminClient();
  await Promise.all([
    db.from("workflow_schedules").update({ enabled: false }).eq("workflow_id", workflowId),
    db.from("webhook_endpoints").update({ enabled: false }).eq("workflow_id", workflowId),
  ]);
}
export async function deleteAutomation(ctx: AuthContext, id: string): Promise<void> {
  requireWrite(ctx);
  const cur = await load(ctx, id);
  const { error } = await ctx.supabase.from("agents").delete().eq("id", cur.agent_id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the automation");
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "automation_deleted",
    title: `Automation deleted: ${cur.name}`,
    body: "The workflow and its schedules were removed from your workspace.",
  });
}
export interface PublishResult { automation: AutomationDto; /** Shown once; only its hash is stored. */ webhookSecret?: string }
export async function publishAutomation(ctx: AuthContext, id: string): Promise<PublishResult> {
  requireWrite(ctx);
  const cur = await load(ctx, id);
  const check = validateWorkflow(cur.definition);
  if (!check.valid) throw Errors.invalid("Fix the validation issues before publishing.", check.issues);
  const def = cur.definition as WorkflowDefinition;
  const db = createAdminClient();
  // Every bot a node refers to must belong to this workspace.
  const botIds = [...new Set(def.nodes.map((n) => (n.config as { botId?: unknown }).botId).filter((b): b is string => typeof b === "string" && b.length > 0))];
  if (botIds.length) {
    const { data } = await db.from("bots").select("id").eq("workspace_id", ctx.workspaceId).in("id", botIds);
    if ((data ?? []).length !== botIds.length) throw Errors.invalid("A node uses a bot that no longer exists. Pick a bot in the node settings.");
  }
  const { data, error } = await ctx.supabase.from("workflows")
    .update({ status: "active", version: cur.version + 1, published_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", ctx.workspaceId).select(COLS).single();
  if (error) throw new Error("Failed to publish the automation");
  await ctx.supabase.from("agents").update({ status: "active" }).eq("id", cur.agent_id).eq("workspace_id", ctx.workspaceId);
  const trigger = def.nodes.find((n) => n.type.startsWith("trigger."))!;
  let webhookSecret: string | undefined;
  if (trigger.type === "trigger.schedule") {
    const cfg = trigger.config as { cron: string; timezone?: string };
    const tz = cfg.timezone || "UTC";
    await db.from("workflow_schedules").upsert({
      workflow_id: id, workspace_id: ctx.workspaceId, cron: cfg.cron, timezone: tz, enabled: true, next_run_at: nextRun(cfg.cron, new Date(), tz)?.toISOString() ?? null,
    }, { onConflict: "workflow_id" });
  } else {
    await db.from("workflow_schedules").update({ enabled: false }).eq("workflow_id", id);
  }
  if (trigger.type === "trigger.webhook") {
    const { data: existing } = await db.from("webhook_endpoints").select("id").eq("workflow_id", id).maybeSingle();
    if (existing) await db.from("webhook_endpoints").update({ enabled: true }).eq("id", existing.id);
    else {
      webhookSecret = randomToken(24);
      await db.from("webhook_endpoints").insert({ workspace_id: ctx.workspaceId, workflow_id: id, secret_hash: await sha256Hex(webhookSecret) });
    }
  } else {
    await db.from("webhook_endpoints").update({ enabled: false }).eq("workflow_id", id);
  }
  await db.from("activity_logs").insert({ workspace_id: ctx.workspaceId, actor_id: ctx.userId, action: "automation.published", detail: cur.name });
  await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "automation_published", title: `Automation published: ${cur.name}`, body: "Your workflow is live and ready to trigger.", emailKey: "workflowStatus" });
  return { automation: await toDto(ctx, data as WfRow), webhookSecret };
}
export async function unpublishAutomation(ctx: AuthContext, id: string): Promise<AutomationDto> {
  requireWrite(ctx);
  const cur = await load(ctx, id);
  const { data, error } = await ctx.supabase.from("workflows").update({ status: "draft", published_at: null }).eq("id", id).eq("workspace_id", ctx.workspaceId).select(COLS).single();
  if (error) throw new Error("Failed to unpublish the automation");
  await ctx.supabase.from("agents").update({ status: "inactive" }).eq("id", cur.agent_id).eq("workspace_id", ctx.workspaceId);
  await pause(id);
  await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "automation_unpublished", title: `Automation paused: ${cur.name}`, body: "Schedules and webhooks for this workflow were paused.", emailKey: "workflowStatus" });
  return toDto(ctx, data as WfRow);
}
/** Issues a new webhook secret (the old one stops working). Shown once. */
export async function rotateWebhookSecret(ctx: AuthContext, id: string): Promise<{ url: string; secret: string }> {
  requireWrite(ctx);
  await load(ctx, id);
  const db = createAdminClient();
  const { data: hook } = await db.from("webhook_endpoints").select("id, public_id").eq("workflow_id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (!hook) throw Errors.invalid("This automation has no webhook trigger. Publish it with an Incoming Webhook trigger first.");
  const secret = randomToken(24);
  await db.from("webhook_endpoints").update({ secret_hash: await sha256Hex(secret) }).eq("id", hook.id);
  return { url: hookUrl(hook.public_id as string), secret };
}
/** Bots of the workspace, for the node settings pickers. */
export async function listBotOptions(ctx: AuthContext): Promise<{ id: string; name: string; username: string }[]> {
  const { data } = await ctx.supabase.from("bots").select("id, name, telegram_username").eq("workspace_id", ctx.workspaceId).order("name").limit(100);
  return (data ?? []).map((b) => ({ id: b.id as string, name: b.name as string, username: (b.telegram_username as string | null) ?? "" }));
}

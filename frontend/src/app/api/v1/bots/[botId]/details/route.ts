import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { getBot } from "@backend/server/repositories/bots";

/** Returns workflows and recent executions/activity for a bot's Automation and Analytics tabs. */
export const GET = route<{ params: Promise<{ botId: string }> }>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  const botId = uuid.parse((await params).botId);
  await getBot(ctx, botId);
  const [wfRes, execRes, logRes] = await Promise.all([
    ctx.supabase
      .from("workflows")
      .select("id, name, status, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .eq("bot_id", botId)
      .order("updated_at", { ascending: false })
      .limit(20),
    ctx.supabase
      .from("executions")
      .select("id, trigger_type, status, duration_ms, started_at")
      .eq("workspace_id", ctx.workspaceId)
      .eq("bot_id", botId)
      .order("started_at", { ascending: false })
      .limit(15),
    ctx.supabase
      .from("activity_logs")
      .select("id, action, detail, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  return ok(
    {
      workflows: wfRes.data ?? [],
      executions: execRes.data ?? [],
      logs: logRes.data ?? [],
    },
    {},
    200,
    requestId,
  );
});

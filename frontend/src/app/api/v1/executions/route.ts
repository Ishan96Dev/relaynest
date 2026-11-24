import { ok, route } from "@backend/lib/http/api";
import { paginationInput } from "@backend/lib/validation/schemas";
import { withApiAccess } from "@backend/server/auth/context";

export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "workflows:read", async (ctx) => {
    const { limit, cursor } = paginationInput.parse(Object.fromEntries(new URL(req.url).searchParams));
    let q = ctx.supabase
      .from("executions")
      .select("id, bot_id, workflow_id, trigger_type, status, started_at, duration_ms, error_code")
      .eq("workspace_id", ctx.workspaceId)
      .order("started_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) q = q.lt("started_at", Buffer.from(cursor, "base64url").toString());
    const { data, error } = await q;
    if (error) throw new Error("Failed to list executions");
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return ok(page, { hasMore, nextCursor: hasMore && last ? Buffer.from(String(last.started_at)).toString("base64url") : null }, 200, requestId);
  }),
);

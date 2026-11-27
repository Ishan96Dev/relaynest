import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { withApiAccess } from "@backend/server/auth/context";
import { getExecutionDetail } from "@backend/server/services/execution-trace";

/** Returns complete execution metadata, ordered step-by-step journey, AI model calls, and phase timing for one run. */
export const GET = route<{ params: Promise<{ executionId: string }> }>(async (req, { params }, requestId) =>
  withApiAccess(req, "workflows:read", async (ctx) => {
    const executionId = uuid.parse((await params).executionId);
    const detail = await getExecutionDetail(ctx, executionId);
    return ok(detail, {}, 200, requestId);
  }),
);

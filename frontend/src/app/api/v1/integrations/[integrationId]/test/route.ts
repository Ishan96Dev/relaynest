import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { withApiAccess } from "@backend/server/auth/context";
import { testIntegration } from "@backend/server/services/integrations";

type Ctx = { params: Promise<{ integrationId: string }> };

export const POST = route<Ctx>(async (req, { params }, requestId) =>
  withApiAccess(req, "integrations:write", async (ctx) => {
    const id = uuid.parse((await params).integrationId);
    return ok(await testIntegration(ctx, id), {}, 200, requestId);
  }),
);

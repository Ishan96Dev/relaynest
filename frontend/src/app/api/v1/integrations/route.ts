import { ok, readJson, route } from "@backend/lib/http/api";
import { withApiAccess } from "@backend/server/auth/context";
import { createIntegration, createIntegrationInput, getIntegrationsData } from "@backend/server/services/integrations";

export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "integrations:read", async (ctx) => ok(await getIntegrationsData(ctx), {}, 200, requestId)),
);

export const POST = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "integrations:write", async (ctx) => {
    const input = createIntegrationInput.parse(await readJson(req));
    return ok(await createIntegration(ctx, input), {}, 201, requestId);
  }),
);

import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { executeWorkflow, validateWorkflow, workflowDefinitionSchema } from "@backend/server/workflow-engine";

const body = z.object({ definition: workflowDefinitionSchema, payload: z.record(z.string(), z.unknown()).default({}) });

/** Dry run: actions are simulated, nothing is sent. */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const { definition, payload } = body.parse(await readJson(req, 512 * 1024));
  const check = validateWorkflow(definition);
  if (!check.valid) return ok({ validation: check, execution: null }, {}, 200, requestId);
  const result = await executeWorkflow(
    definition,
    { type: "test", workspaceId: ctx.workspaceId, source: "test", occurredAt: new Date().toISOString(), payload },
    {
      sendTelegramMessage: async () => ({ externalMessageId: "simulated" }),
      httpRequest: async () => ({ status: 200 }),
      insertRecord: async () => {},
    },
    { executionId: `test_${requestId}` },
  );
  return ok({ validation: check, execution: result }, {}, 200, requestId);
});

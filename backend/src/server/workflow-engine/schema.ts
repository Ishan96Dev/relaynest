import { z } from "zod";
import { isValidCron, isValidTimezone } from "../../lib/cron";

export const NODE_TYPES = [
  "trigger.telegram.message",
  "trigger.webhook",
  "trigger.schedule",
  "condition.equals",
  "condition.notEquals",
  "condition.contains",
  "condition.isEmpty",
  "condition.httpStatus",
  "action.telegram.sendMessage",
  "action.http.request",
  "action.database.insert",
  "action.ai.research",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const LIMITS = { maxNodes: 50, maxEdges: 100, maxActionsPerExecution: 20, maxExecutionMs: 30_000 } as const;

const fieldPath = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_.\[\]-]+$/, "Invalid field path.");

export const configSchemas: Record<NodeType, z.ZodType> = {
  "trigger.telegram.message": z.object({ botId: z.string().min(1), commandFilter: z.string().max(64).optional() }),
  "trigger.webhook": z.object({}).passthrough(),
  "trigger.schedule": z.object({
    cron: z.string().trim().min(1).max(64).refine(isValidCron, "Use 5 fields: minute hour day month weekday (for example 0 9 * * *)."),
    timezone: z.string().trim().max(64).refine((v) => v === "" || isValidTimezone(v), "Unknown time zone. Use an IANA name such as Asia/Kolkata.").optional(),
  }),
  "condition.equals": z.object({ field: fieldPath, value: z.string().max(1000) }),
  "condition.notEquals": z.object({ field: fieldPath, value: z.string().max(1000) }),
  "condition.contains": z.object({ field: fieldPath, value: z.string().min(1).max(1000), caseSensitive: z.boolean().default(false) }),
  "condition.isEmpty": z.object({ field: fieldPath }),
  "condition.httpStatus": z.object({ min: z.number().int().min(100).max(599), max: z.number().int().min(100).max(599) }),
  "action.telegram.sendMessage": z.object({
    botId: z.string().min(1),
    chatIdSource: z.enum(["configured", "trigger"]),
    chatId: z.string().max(64).optional(),
    text: z.string().trim().min(1).max(4096),
  }),
  "action.http.request": z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    url: z.string().url().max(2000),
    body: z.string().max(10_000).optional(),
  }),
  "action.database.insert": z.object({ collection: z.string().trim().min(1).max(64), record: z.record(z.string(), z.string()) }),
  "action.ai.research": z.object({
    prompt: z.string().trim().min(1, "Enter a research or briefing prompt.").max(4000),
    systemPrompt: z.string().trim().max(4000).optional(),
    agentId: z.string().trim().max(64).optional(),
    category: z.string().trim().max(60).optional(),
    modelSlug: z.string().trim().max(90).optional(),
    includeWebSearch: z.boolean().default(true),
    includeMarketData: z.boolean().default(true),
  }),
};

export const nodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(NODE_TYPES),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const edgeSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.enum(["true", "false"]).optional(),
});

export const workflowDefinitionSchema = z.object({
  version: z.literal(1),
  nodes: z.array(nodeSchema).max(LIMITS.maxNodes),
  edges: z.array(edgeSchema).max(LIMITS.maxEdges),
});

export type WorkflowNode = z.infer<typeof nodeSchema>;
export type WorkflowEdge = z.infer<typeof edgeSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const category = (t: NodeType) => t.split(".")[0] as "trigger" | "condition" | "action";

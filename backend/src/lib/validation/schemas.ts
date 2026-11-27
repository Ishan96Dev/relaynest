import { z } from "zod";

export const uuid = z.string().uuid();

export const botStatus = z.enum(["draft", "active", "inactive", "error"]);

/** Telegram tokens look like 123456789:AA... Validate shape only; Telegram's getMe is the real check. */
export const telegramToken = z
  .string()
  .trim()
  .regex(/^\d{5,16}:[A-Za-z0-9_-]{30,50}$/, "Token format is invalid.");

export const createBotInput = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(300).optional(),
  category: z.string().trim().max(60).optional(),
  token: telegramToken,
  welcomeMessage: z.string().trim().max(4096).optional(),
  defaultResponse: z.string().trim().max(4096).optional(),
});

export const updateBotInput = z
  .object({
    name: z.string().trim().min(1).max(50),
    description: z.string().trim().max(300),
    category: z.string().trim().max(60),
    welcomeMessage: z.string().trim().max(4096),
    defaultResponse: z.string().trim().max(4096),
    avatarPath: z.string().trim().max(240).nullable(),
    status: botStatus,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field is required.");

export const validateTokenInput = z.object({ token: telegramToken });

export const botCommandResponseType = z.enum(["text", "builtin", "chat", "image", "describe", "search", "market", "brief"]);
export type BotCommandResponseType = z.infer<typeof botCommandResponseType>;

export const commandInput = z
  .object({
    command: z.string().trim().regex(/^\/?[a-z0-9_]{1,32}$/i, "Use 1-32 letters, digits or underscores."),
    description: z.string().trim().max(256).optional(),
    responseType: botCommandResponseType.default("text"),
    responseText: z.string().trim().max(4096).default(""),
    instruction: z.string().trim().max(1000).optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.responseType === "text" && v.responseText.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["responseText"], message: "Enter a reply text for this command." });
    }
  });

export const botResponseRuleInput = z
  .object({
    matchType: z.enum(["welcome", "default", "keyword"]),
    matchValue: z.string().trim().max(200).nullable().optional(),
    responseText: z.string().trim().min(1, "Enter a response message.").max(4096),
    priority: z.number().int().min(1).max(1000).default(100),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.matchType === "keyword" && (!v.matchValue || !v.matchValue.trim())) {
      ctx.addIssue({ code: "custom", path: ["matchValue"], message: "Enter a keyword or phrase to match." });
    }
  });

export const botResponsesUpdateInput = z.object({
  welcomeMessage: z.string().trim().max(4096).default(""),
  defaultResponse: z.string().trim().max(4096).default(""),
  rules: z.array(botResponseRuleInput).max(50).default([]),
});

export const paginationInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});

export const credentialsInput = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

export const commandsBatchInput = z.object({
  commands: z.array(commandInput).min(1).max(20),
});
export const modelSlug = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, "Invalid model.");

/** Telegram bot usernames: 5-32 characters, letters, digits and underscores, ending in "bot". */
export const telegramBotUsername = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9_]{3,30}[Bb][Oo][Tt]$/, "Use 5-32 letters, digits or underscores, ending in \"bot\".");

export const createAiAgentInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(50),
  username: telegramBotUsername,
  description: z.string().trim().min(1, "Enter a description.").max(300),
  /** Object path in the `avatars` bucket; must live in the caller's own folder (checked in the service). */
  avatarPath: z.string().trim().max(200).nullable().optional(),
  language: z.string().trim().min(2).max(40).default("English"),
  category: z.string().trim().min(2).max(60).default("Community Manager"),
  modelSlug: modelSlug.nullable().optional(),
});

/** Behaviour switches shown in the "Tools & Capabilities" step of the AI Agent wizard. */
export const toolsSchema = z.object({
  datetime: z.boolean().default(true),
  mentionOnly: z.boolean().default(true),
  typing: z.boolean().default(true),
  matchLanguage: z.boolean().default(true),
  webSearch: z.boolean().default(true),
  /** Autonomously run live web search on natural messages when fresh data is needed (without requiring /search). */
  autoSearch: z.boolean().default(false),
  /** Enable live NSE, BSE, MSE stock quotes, indices, commodities, forex & crypto lookups. */
  marketData: z.boolean().default(false),
});

/** Slash commands that start with the bot menu entries. start, help and reset are built in. */
export const RESERVED_COMMANDS = ["start", "help", "reset"];
export const agentCommandSchema = z.object({
  command: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,31}$/, "Use 1-32 lowercase letters, digits or underscores, starting with a letter.").refine((c) => !RESERVED_COMMANDS.includes(c), "start, help and reset are built in."),
  description: z.string().trim().min(1, "Add a short description.").max(100),
  /** chat: language model reply. image: generate image. describe: photo OCR/vision. search: live web search. market: live NSE/BSE/MSE market lookup. brief: daily multi-source intelligence brief. */
  kind: z.enum(["chat", "image", "describe", "search", "market", "brief"]),
  /** Extra guidance for this command. For image commands, {input} is replaced by what the person typed. */
  instruction: z.string().trim().max(1000).default(""),
});
export type AgentCommand = z.infer<typeof agentCommandSchema>;
export const agentCommandsSchema = z.array(agentCommandSchema).max(15).refine((l) => new Set(l.map((c) => c.command)).size === l.length, "Each command name must be unique.");

export const updateAiAgentInput = z
  .object({
    name: z.string().trim().min(1).max(50),
    username: telegramBotUsername,
    description: z.string().trim().min(1).max(300),
    avatarPath: z.string().trim().max(200).nullable(),
    language: z.string().trim().min(2).max(40),
    category: z.string().trim().min(2).max(60),
    modelSlug: modelSlug.nullable(),
    imageModelSlug: modelSlug.nullable(),
    commands: agentCommandsSchema,
    instructions: z.string().trim().max(8000),
    welcomeMessage: z.string().trim().max(4096).nullable(),
    fallbackMessage: z.string().trim().max(4096).nullable(),
    temperature: z.number().min(0).max(1),
    maxTokens: z.number().int().min(64).max(4096),
    memoryTurns: z.number().int().min(0).max(30),
    tools: toolsSchema,
    /** When true, persists step/draft progress quietly without sending in-app notifications. */
    silent: z.boolean(),
    /** Set by the wizard's explicit Save Changes action when earlier steps saved quietly. */
    notifySummary: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).some((k) => k !== "silent" && k !== "notifySummary"), "At least one field is required.");

export const knowledgeInput = z.object({ title: z.string().trim().min(1).max(120), content: z.string().trim().min(1).max(20000) });
export const connectInput = z.object({ token: telegramToken });
export const testInput = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(30).default([]),
});

// ---------- Knowledge Base ----------
export const collectionInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  tone: z.enum(["primary", "info", "success", "amber"]).default("primary"),
});
export const updateCollectionInput = collectionInput.partial().refine((v) => Object.keys(v).length > 0, "At least one field is required.");
export const collectionBotsInput = z.object({ botIds: z.array(uuid).max(200) });
export const urlDocumentInput = z.object({ collectionId: uuid, url: z.string().trim().url().max(2000) });
export const knowledgeSearchInput = z.object({ query: z.string().trim().min(2).max(1000), collectionIds: z.array(uuid).max(50).optional() });

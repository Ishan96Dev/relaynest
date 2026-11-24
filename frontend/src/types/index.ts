export type BotStatus = "draft" | "active" | "inactive" | "error";
export type WebhookStatus = "registered" | "polling" | "pending" | "removed" | "error" | "telegram_deleted";

export interface BotHistoryEntry {
  id: string;
  botId: string | null;
  botName: string;
  username: string;
  event: "created" | "deleted" | "deleted_on_telegram";
  usedFor: string;
  category: string;
  description: string;
  commands: string[];
  welcomeMessage: string;
  defaultResponse: string;
  modelName: string | null;
  messagesCount: number;
  botCreatedAt: string | null;
  occurredAt: string;
}

export interface Bot {
  id: string;
  publicId?: string;
  name: string;
  username: string;
  avatarPath?: string | null;
  description: string;
  welcomeMessage?: string;
  defaultResponse?: string;
  status: BotStatus;
  webhookStatus: WebhookStatus;
  messages: number;
  activeUsers: number;
  lastActive: string;
  category: string;
  createdAt: string;
}

export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Execution {
  id: string;
  botName: string;
  trigger: string;
  status: ExecutionStatus;
  durationMs: number;
  startedAt: string;
}

export interface BotTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: "Easy" | "Medium";
  popular?: boolean;
  uses: string;
  features: string[];
  commands: { command: string; description: string }[];
  requirements?: string[];
  previewReply?: string;
  /** Prefilled into the bot wizard. */
  welcomeMessage?: string;
  defaultResponse?: string;
}

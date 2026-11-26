import { z } from "zod";
import { TIMEZONE_CHOICES } from "@backend/lib/preferences";

export const NOTIFICATION_FREQUENCY_CHOICES = ["immediately", "daily", "weekly", "off"] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCY_CHOICES)[number];

export const EMAIL_NOTIFICATION_KEYS = [
  "accountSecurity",
  "login",
  "apiKeys",
  "invites",
  "botConnected",
  "botOffline",
  "automationFailures",
  "workflowStatus",
  "billing",
  "product",
  "features",
  "marketing",
] as const;
export type EmailNotificationKey = (typeof EMAIL_NOTIFICATION_KEYS)[number];

export const INAPP_NOTIFICATION_KEYS = [
  "login",
  "security",
  "apiKeys",
  "botActivity",
  "aiAgents",
  "knowledgeBase",
  "automationEvents",
  "executionFailures",
  "integrations",
  "billing",
  "workspace",
  "system",
] as const;
export type InAppNotificationKey = (typeof INAPP_NOTIFICATION_KEYS)[number];

const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const emailPrefsShape = {
  accountSecurity: z.boolean().default(true),
  login: z.boolean().default(false),
  apiKeys: z.boolean().default(true),
  invites: z.boolean().default(true),
  botConnected: z.boolean().default(true),
  botOffline: z.boolean().default(true),
  automationFailures: z.boolean().default(true),
  workflowStatus: z.boolean().default(true),
  billing: z.boolean().default(true),
  product: z.boolean().default(true),
  features: z.boolean().default(true),
  marketing: z.boolean().default(false),
};

const inappPrefsShape = {
  login: z.boolean().default(false),
  security: z.boolean().default(true),
  apiKeys: z.boolean().default(true),
  botActivity: z.boolean().default(true),
  aiAgents: z.boolean().default(true),
  knowledgeBase: z.boolean().default(true),
  automationEvents: z.boolean().default(true),
  executionFailures: z.boolean().default(true),
  integrations: z.boolean().default(true),
  billing: z.boolean().default(true),
  workspace: z.boolean().default(true),
  system: z.boolean().default(true),
};

export const emailNotificationPrefsSchema = z.object(emailPrefsShape);
export const inappNotificationPrefsSchema = z.object(inappPrefsShape);

export const notificationSettingsSchema = z.object({
  email: emailNotificationPrefsSchema.default(() => emailNotificationPrefsSchema.parse({})),
  inapp: inappNotificationPrefsSchema.default(() => inappNotificationPrefsSchema.parse({})),
  frequency: z.enum(NOTIFICATION_FREQUENCY_CHOICES).default("immediately"),
  disableNonCritical: z.boolean().default(false),
  quiet: z.boolean().default(true),
  from: z.string().regex(hhmmRegex, "Use HH:MM 24-hour format.").default("22:00"),
  to: z.string().regex(hhmmRegex, "Use HH:MM 24-hour format.").default("07:00"),
  timezone: z.enum(TIMEZONE_CHOICES).default("Asia/Kolkata"),
});

export const notificationSettingsPatchSchema = z
  .object({
    email: z.object(
      Object.fromEntries(EMAIL_NOTIFICATION_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
        EmailNotificationKey,
        z.ZodOptional<z.ZodBoolean>
      >,
    ).optional(),
    inapp: z.object(
      Object.fromEntries(INAPP_NOTIFICATION_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
        InAppNotificationKey,
        z.ZodOptional<z.ZodBoolean>
      >,
    ).optional(),
    frequency: z.enum(NOTIFICATION_FREQUENCY_CHOICES).optional(),
    disableNonCritical: z.boolean().optional(),
    quiet: z.boolean().optional(),
    from: z.string().regex(hhmmRegex, "Use HH:MM 24-hour format.").optional(),
    to: z.string().regex(hhmmRegex, "Use HH:MM 24-hour format.").optional(),
    timezone: z.enum(TIMEZONE_CHOICES).optional(),
  })
  .refine(
    (v) =>
      Object.keys(v).some((k) => {
        const val = v[k as keyof typeof v];
        if (val === undefined) return false;
        if (typeof val === "object" && val !== null) return Object.values(val).some((inner) => inner !== undefined);
        return true;
      }),
    "At least one notification setting is required.",
  );

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type NotificationSettingsPatch = z.infer<typeof notificationSettingsPatchSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = notificationSettingsSchema.parse({});

export const INAPP_CATEGORY_LABELS: Record<InAppNotificationKey, string> = {
  login: "Logins",
  security: "Security",
  apiKeys: "API Keys",
  botActivity: "Bots",
  aiAgents: "AI Agents",
  knowledgeBase: "Knowledge",
  automationEvents: "Automations",
  executionFailures: "Failures",
  integrations: "Integrations",
  billing: "Billing",
  workspace: "Workspace",
  system: "System",
};

export interface NotificationRule {
  inappKey: InAppNotificationKey;
  defaultEmailKey?: EmailNotificationKey;
  /** Critical alerts bypass quiet hours, frequency="off", and disableNonCritical — while still honoring their explicit category switch. */
  critical?: boolean;
  actionUrl: string;
}

export const NOTIFICATION_RULES: Record<string, NotificationRule> = {
  // Login & Authentication (optional in-app & email; defaults to off unless user opts in)
  login_detected: { inappKey: "login", defaultEmailKey: "login", critical: true, actionUrl: "/settings/security" },

  // Account Security
  password_changed: { inappKey: "security", defaultEmailKey: "accountSecurity", critical: true, actionUrl: "/settings/security" },
  sessions_revoked: { inappKey: "security", defaultEmailKey: "accountSecurity", critical: true, actionUrl: "/settings/security" },

  // API Keys & Bot Credentials
  api_key_created: { inappKey: "apiKeys", defaultEmailKey: "apiKeys", critical: true, actionUrl: "/settings/api-keys" },
  api_key_rotated: { inappKey: "apiKeys", defaultEmailKey: "apiKeys", critical: true, actionUrl: "/settings/api-keys" },
  api_key_revoked: { inappKey: "apiKeys", defaultEmailKey: "apiKeys", critical: true, actionUrl: "/settings/api-keys" },
  api_key_deleted: { inappKey: "apiKeys", actionUrl: "/settings/api-keys" },
  bot_token_updated: { inappKey: "apiKeys", defaultEmailKey: "apiKeys", critical: true, actionUrl: "/bots" },

  // Bot Activity & Status
  bot_created: { inappKey: "botActivity", actionUrl: "/bots" },
  bot_connected: { inappKey: "botActivity", defaultEmailKey: "botConnected", actionUrl: "/bots" },
  bot_updated: { inappKey: "botActivity", actionUrl: "/bots" },
  bot_photo_updated: { inappKey: "botActivity", actionUrl: "/bots" },
  bot_activated: { inappKey: "botActivity", actionUrl: "/bots" },
  bot_paused: { inappKey: "botActivity", defaultEmailKey: "botOffline", actionUrl: "/bots" },
  bot_disconnected: { inappKey: "botActivity", defaultEmailKey: "botOffline", actionUrl: "/bots" },
  bot_deleted: { inappKey: "botActivity", defaultEmailKey: "botOffline", actionUrl: "/bots" },
  bot_deleted_telegram: { inappKey: "botActivity", defaultEmailKey: "botOffline", critical: true, actionUrl: "/bots" },

  // AI Agents
  agent_created: { inappKey: "aiAgents", actionUrl: "/ai" },
  agent_updated: { inappKey: "aiAgents", actionUrl: "/ai" },
  agent_connected: { inappKey: "aiAgents", defaultEmailKey: "botConnected", actionUrl: "/ai" },
  agent_activated: { inappKey: "aiAgents", actionUrl: "/ai" },
  agent_deactivated: { inappKey: "aiAgents", actionUrl: "/ai" },
  agent_deleted: { inappKey: "aiAgents", actionUrl: "/ai" },

  // Knowledge Base
  kb_collection_created: { inappKey: "knowledgeBase", actionUrl: "/knowledge-base" },
  kb_collection_deleted: { inappKey: "knowledgeBase", actionUrl: "/knowledge-base" },
  kb_document_indexed: { inappKey: "knowledgeBase", actionUrl: "/knowledge-base" },
  kb_document_failed: { inappKey: "knowledgeBase", actionUrl: "/knowledge-base" },

  // Automations
  automation_created: { inappKey: "automationEvents", actionUrl: "/agents" },
  automation_published: { inappKey: "automationEvents", defaultEmailKey: "workflowStatus", actionUrl: "/agents" },
  automation_unpublished: { inappKey: "automationEvents", defaultEmailKey: "workflowStatus", actionUrl: "/agents" },
  automation_succeeded: { inappKey: "automationEvents", actionUrl: "/executions" },
  automation_deleted: { inappKey: "automationEvents", actionUrl: "/agents" },

  // Execution & Delivery Failures
  execution_failed: { inappKey: "executionFailures", defaultEmailKey: "automationFailures", critical: true, actionUrl: "/executions" },
  integration_failed: { inappKey: "executionFailures", critical: true, actionUrl: "/integrations" },
  agent_execution_failed: { inappKey: "executionFailures", critical: true, actionUrl: "/executions" },

  // Integrations & Webhooks
  integration_connected: { inappKey: "integrations", actionUrl: "/integrations" },
  integration_tested: { inappKey: "integrations", actionUrl: "/integrations" },
  integration_toggled: { inappKey: "integrations", actionUrl: "/integrations" },
  integration_deleted: { inappKey: "integrations", actionUrl: "/integrations" },
  webhook_provisioned: { inappKey: "integrations", actionUrl: "/integrations" },
  webhook_triggered: { inappKey: "integrations", actionUrl: "/integrations" },

  // Billing & Plan Usage
  payment_received: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },
  payment_failed: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },
  payment_refunded: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },
  plan_activated: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },
  plan_renewing: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },
  plan_expiring: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },
  subscription_cancelled: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },
  plan_limit: { inappKey: "billing", defaultEmailKey: "billing", critical: true, actionUrl: "/settings/billing" },

  // Workspace & Profile
  workspace_updated: { inappKey: "workspace", actionUrl: "/settings/workspace" },
  member_invited: { inappKey: "workspace", defaultEmailKey: "invites", actionUrl: "/settings/workspace" },
  profile_updated: { inappKey: "workspace", actionUrl: "/settings/profile" },

  // System Announcements
  system_announcement: { inappKey: "system", defaultEmailKey: "product", actionUrl: "/settings/notifications" },
};

export function ruleForNotificationKind(kind: string): NotificationRule {
  return NOTIFICATION_RULES[kind] ?? { inappKey: "system", actionUrl: "/settings/notifications" };
}

/** Deep-merges arbitrary JSON from Supabase or localStorage into a valid, complete NotificationSettings object. */
export function parseNotificationSettings(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
  }
  const input = raw as Record<string, unknown>;
  const rawEmail = input.email && typeof input.email === "object" && !Array.isArray(input.email) ? (input.email as Record<string, unknown>) : {};
  const rawInapp = input.inapp && typeof input.inapp === "object" && !Array.isArray(input.inapp) ? (input.inapp as Record<string, unknown>) : {};

  const email: Record<string, boolean> = { ...DEFAULT_NOTIFICATION_SETTINGS.email };
  for (const key of EMAIL_NOTIFICATION_KEYS) {
    if (typeof rawEmail[key] === "boolean") email[key] = rawEmail[key] as boolean;
  }

  const inapp: Record<string, boolean> = { ...DEFAULT_NOTIFICATION_SETTINGS.inapp };
  for (const key of INAPP_NOTIFICATION_KEYS) {
    if (typeof rawInapp[key] === "boolean") inapp[key] = rawInapp[key] as boolean;
  }

  const cleaned: Record<string, unknown> = { email, inapp };
  for (const key of ["frequency", "disableNonCritical", "quiet", "from", "to", "timezone"] as const) {
    if (key in input) {
      const res = notificationSettingsSchema.shape[key].safeParse(input[key]);
      if (res.success) cleaned[key] = res.data;
    }
  }
  return notificationSettingsSchema.parse(cleaned);
}

/** Merges a partial patch deeply onto an existing NotificationSettings object. */
export function mergeNotificationSettings(
  existing: NotificationSettings,
  patch: NotificationSettingsPatch,
): NotificationSettings {
  return notificationSettingsSchema.parse({
    ...existing,
    ...patch,
    email: { ...existing.email, ...(patch.email ?? {}) },
    inapp: { ...existing.inapp, ...(patch.inapp ?? {}) },
  });
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Returns true when `now` falls inside the user's configured quiet-hours window in their timezone. */
export function isWithinQuietHours(
  settings: Pick<NotificationSettings, "quiet" | "from" | "to" | "timezone">,
  now: Date = new Date(),
): boolean {
  if (!settings.quiet) return false;
  const start = parseMinutes(settings.from);
  const end = parseMinutes(settings.to);
  if (start === end) return false;

  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: settings.timezone,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const current = hour * 60 + minute;

  // Overnight window (e.g. 22:00 -> 07:00) vs daytime window (e.g. 09:00 -> 17:00)
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export interface DeliveryDecision {
  category: InAppNotificationKey;
  actionUrl: string;
  critical: boolean;
  sendInApp: boolean;
  sendEmail: boolean;
  resolvedEmailKey: EmailNotificationKey | null;
}

/**
 * Evaluates whether an event should create an in-app notification and/or send an email
 * according to the user's persisted NotificationSettings.
 *
 * Rules:
 * 1. Explicit per-category switches (`inapp[category]` / `email[key]`) are ALWAYS respected.
 *    Turning off `inapp.login` or `email.login` always disables login alerts.
 * 2. Global mutes (`disableNonCritical`, `frequency === "off"`, and active `quiet` hours)
 *    suppress non-critical events while allowing enabled critical events through.
 */
export function shouldDeliverNotification(
  kind: string,
  settings: NotificationSettings,
  opts?: { emailKey?: EmailNotificationKey | null; now?: Date },
): DeliveryDecision {
  const rule = ruleForNotificationKind(kind);
  const critical = Boolean(rule.critical);
  const quietNow = isWithinQuietHours(settings, opts?.now);
  const nonCriticalMuted = settings.disableNonCritical || settings.frequency === "off" || quietNow;

  const inappCategoryEnabled = settings.inapp[rule.inappKey] !== false;
  const sendInApp = inappCategoryEnabled && (critical || !nonCriticalMuted);

  const resolvedEmailKey = opts?.emailKey !== undefined ? opts.emailKey : null;
  const emailEnabled = resolvedEmailKey !== null && settings.email[resolvedEmailKey] !== false;
  const sendEmail = emailEnabled && (critical || !nonCriticalMuted);

  return {
    category: rule.inappKey,
    actionUrl: rule.actionUrl,
    critical,
    sendInApp,
    sendEmail,
    resolvedEmailKey,
  };
}

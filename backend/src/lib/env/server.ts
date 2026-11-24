import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "must be 32 bytes encoded as 64 hex characters"),
  ENCRYPTION_KEY_VERSION: z.string().min(1).default("v1"),
  TELEGRAM_API_BASE_URL: z.string().url().default("https://api.telegram.org"),
  /** How Telegram updates reach the app: a public webhook, or the server polling Telegram (no public URL needed). */
  TELEGRAM_UPDATES_MODE: z.enum(["auto", "webhook", "polling"]).default("auto"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/** Validates server-only secrets lazily. Names missing variables, never prints values. */
export function serverEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENCRYPTION_KEY_VERSION: process.env.ENCRYPTION_KEY_VERSION || undefined,
    TELEGRAM_API_BASE_URL: process.env.TELEGRAM_API_BASE_URL || undefined,
    TELEGRAM_UPDATES_MODE: process.env.TELEGRAM_UPDATES_MODE?.trim().toLowerCase() || undefined,
  });
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${names}`);
  }
  return parsed.data;
}

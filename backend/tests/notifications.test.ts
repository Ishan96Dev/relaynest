import { describe, it } from "node:test";
import { expect } from "./expect";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  EMAIL_NOTIFICATION_KEYS,
  INAPP_NOTIFICATION_KEYS,
  isWithinQuietHours,
  mergeNotificationSettings,
  notificationSettingsPatchSchema,
  parseNotificationSettings,
  shouldDeliverNotification,
} from "../src/lib/notifications";

describe("notification settings schema & delivery engine", () => {
  it("defaults login notifications to optional (false) for both email and in-app while enabling operational categories", () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.inapp.login).toBe(false);
    expect(DEFAULT_NOTIFICATION_SETTINGS.email.login).toBe(false);
    expect(DEFAULT_NOTIFICATION_SETTINGS.email.marketing).toBe(false);
    expect(DEFAULT_NOTIFICATION_SETTINGS.inapp.security).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.inapp.apiKeys).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.inapp.aiAgents).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.inapp.knowledgeBase).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.inapp.integrations).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.inapp.billing).toBe(true);
    expect(INAPP_NOTIFICATION_KEYS.length).toBe(12);
    expect(EMAIL_NOTIFICATION_KEYS.length).toBe(12);
  });

  it("deep-merges legacy Supabase rows cleanly without wiping newly added nested keys", () => {
    const legacyRow = {
      email: { login: false, marketing: true, botConnected: false },
      inapp: { botActivity: false, security: true },
      frequency: "daily",
      quiet: true,
      from: "23:00",
      to: "06:00",
      timezone: "UTC",
    };
    const parsed = parseNotificationSettings(legacyRow);
    // Preserves legacy user settings
    expect(parsed.email.login).toBe(false);
    expect(parsed.email.marketing).toBe(true);
    expect(parsed.email.botConnected).toBe(false);
    expect(parsed.inapp.botActivity).toBe(false);
    expect(parsed.inapp.security).toBe(true);
    expect(parsed.frequency).toBe("daily");
    expect(parsed.from).toBe("23:00");
    // Fills newly introduced nested keys with safe defaults
    expect(parsed.inapp.login).toBe(false);
    expect(parsed.inapp.apiKeys).toBe(true);
    expect(parsed.inapp.aiAgents).toBe(true);
    expect(parsed.inapp.knowledgeBase).toBe(true);
    expect(parsed.inapp.integrations).toBe(true);
    expect(parsed.inapp.billing).toBe(true);
    expect(parsed.email.billing).toBe(true);
    expect(parsed.email.apiKeys).toBe(true);
  });

  it("validates partial nested patches and merges without overwriting sibling keys", () => {
    expect(notificationSettingsPatchSchema.safeParse({}).success).toBe(false);
    expect(notificationSettingsPatchSchema.safeParse({ inapp: {} }).success).toBe(false);
    expect(notificationSettingsPatchSchema.safeParse({ from: "25:99" }).success).toBe(false);

    const patch = notificationSettingsPatchSchema.parse({ inapp: { login: true, knowledgeBase: false } });
    const merged = mergeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, patch);
    expect(merged.inapp.login).toBe(true);
    expect(merged.inapp.knowledgeBase).toBe(false);
    expect(merged.inapp.aiAgents).toBe(true);
    expect(merged.email.login).toBe(false);
  });

  it("evaluates overnight and daytime quiet hours accurately in the user's timezone", () => {
    const overnight = { quiet: true, from: "22:00", to: "07:00", timezone: "UTC" as const };
    expect(isWithinQuietHours(overnight, new Date("2026-11-26T23:30:00Z"))).toBe(true);
    expect(isWithinQuietHours(overnight, new Date("2026-11-26T04:15:00Z"))).toBe(true);
    expect(isWithinQuietHours(overnight, new Date("2026-11-26T14:00:00Z"))).toBe(false);

    const daytime = { quiet: true, from: "09:00", to: "17:00", timezone: "UTC" as const };
    expect(isWithinQuietHours(daytime, new Date("2026-11-26T12:00:00Z"))).toBe(true);
    expect(isWithinQuietHours(daytime, new Date("2026-11-26T19:00:00Z"))).toBe(false);

    // 18:00 UTC is 23:30 Asia/Kolkata (inside 22:00 -> 07:00 IST)
    const ist = { quiet: true, from: "22:00", to: "07:00", timezone: "Asia/Kolkata" as const };
    expect(isWithinQuietHours(ist, new Date("2026-11-26T18:00:00Z"))).toBe(true);
    expect(isWithinQuietHours(ist, new Date("2026-11-26T06:00:00Z"))).toBe(false);

    expect(isWithinQuietHours({ ...overnight, quiet: false }, new Date("2026-11-26T23:30:00Z"))).toBe(false);
  });

  it("suppresses login_detected by default and delivers independently when opted in", () => {
    const daytime = new Date("2026-11-26T10:00:00Z");

    // Defaults: both in-app and email login alerts are off
    const offDecision = shouldDeliverNotification("login_detected", DEFAULT_NOTIFICATION_SETTINGS, {
      emailKey: "login",
      now: daytime,
    });
    expect(offDecision.category).toBe("login");
    expect(offDecision.sendInApp).toBe(false);
    expect(offDecision.sendEmail).toBe(false);

    // Opt in to in-app ONLY, keep email off
    const inappOnly = mergeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, { inapp: { login: true }, email: { login: false } });
    const d1 = shouldDeliverNotification("login_detected", inappOnly, { emailKey: "login", now: daytime });
    expect(d1.sendInApp).toBe(true);
    expect(d1.sendEmail).toBe(false);

    // Opt in to email ONLY, keep in-app off
    const emailOnly = mergeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, { inapp: { login: false }, email: { login: true } });
    const d2 = shouldDeliverNotification("login_detected", emailOnly, { emailKey: "login", now: daytime });
    expect(d2.sendInApp).toBe(false);
    expect(d2.sendEmail).toBe(true);
  });

  it("enforces quiet hours, frequency=off, and disableNonCritical while honoring explicit category switches", () => {
    const quietNightUtc = new Date("2026-11-26T23:30:00Z");
    const dayUtc = new Date("2026-11-26T12:00:00Z");
    const settings = parseNotificationSettings({
      timezone: "UTC",
      quiet: true,
      from: "22:00",
      to: "07:00",
      inapp: { billing: false, knowledgeBase: true, aiAgents: false },
    });

    // Non-critical kb_document_indexed: allowed during day, muted during quiet hours
    expect(shouldDeliverNotification("kb_document_indexed", settings, { now: dayUtc }).sendInApp).toBe(true);
    expect(shouldDeliverNotification("kb_document_indexed", settings, { now: quietNightUtc }).sendInApp).toBe(false);

    // Explicit category toggle OFF blocks even critical alerts (billing=false)
    expect(shouldDeliverNotification("payment_received", settings, { now: dayUtc }).sendInApp).toBe(false);

    // Explicit category toggle OFF blocks aiAgents even during daytime
    expect(shouldDeliverNotification("agent_created", settings, { now: dayUtc }).sendInApp).toBe(false);

    // Enabled critical execution failure delivers even during quiet hours and with disableNonCritical=true
    const strictSettings = mergeNotificationSettings(settings, { disableNonCritical: true, frequency: "off" });
    const failDecision = shouldDeliverNotification("execution_failed", strictSettings, {
      emailKey: "automationFailures",
      now: quietNightUtc,
    });
    expect(failDecision.sendInApp).toBe(true);
    expect(failDecision.sendEmail).toBe(true);

    // Non-critical bot_created stays muted under disableNonCritical
    expect(shouldDeliverNotification("bot_created", strictSettings, { now: dayUtc }).sendInApp).toBe(false);
  });
});

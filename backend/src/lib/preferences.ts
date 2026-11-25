import { z } from "zod";

export const THEME_CHOICES = ["dark", "light", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const LANGUAGE_CHOICES = ["English", "English (US)", "English (UK)", "English (India)"] as const;
export const TIMEZONE_CHOICES = ["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"] as const;
export const DATE_FORMAT_CHOICES = ["MMM DD, YYYY", "DD/MM/YYYY", "YYYY-MM-DD"] as const;
export const TIME_FORMAT_CHOICES = ["12-hour", "24-hour"] as const;
export const FIRST_DAY_CHOICES = ["Monday", "Sunday"] as const;
export const LANDING_CHOICES = ["Dashboard", "My Bots", "Analytics"] as const;
export const LAYOUT_CHOICES = ["auto", "grid", "compact"] as const;
export const BOT_VIEW_CHOICES = ["All Bots", "Active Bots"] as const;
export const DENSITY_CHOICES = ["comfortable", "standard", "compact"] as const;
export const EDITOR_THEME_CHOICES = ["dark", "light", "contrast"] as const;

const rawFields = {
  theme: z.enum(THEME_CHOICES),
  language: z.enum(LANGUAGE_CHOICES),
  timezone: z.enum(TIMEZONE_CHOICES),
  dateFormat: z.enum(DATE_FORMAT_CHOICES),
  timeFormat: z.enum(TIME_FORMAT_CHOICES),
  firstDay: z.enum(FIRST_DAY_CHOICES),
  landing: z.enum(LANDING_CHOICES),
  layout: z.enum(LAYOUT_CHOICES),
  botView: z.enum(BOT_VIEW_CHOICES),
  density: z.enum(DENSITY_CHOICES),
  showStats: z.boolean(),
  zoom: z.number().int().min(50).max(150),
  grid: z.boolean(),
  autosave: z.boolean(),
  confirmPublish: z.boolean(),
  editorTheme: z.enum(EDITOR_THEME_CHOICES),
  reduceMotion: z.boolean(),
  highContrast: z.boolean(),
  compact: z.boolean(),
  keyHints: z.boolean(),
};

export const userPreferencesSchema = z.object({
  theme: rawFields.theme.default("dark"),
  language: rawFields.language.default("English"),
  timezone: rawFields.timezone.default("Asia/Kolkata"),
  dateFormat: rawFields.dateFormat.default("MMM DD, YYYY"),
  timeFormat: rawFields.timeFormat.default("12-hour"),
  firstDay: rawFields.firstDay.default("Monday"),
  landing: rawFields.landing.default("Dashboard"),
  layout: rawFields.layout.default("auto"),
  botView: rawFields.botView.default("All Bots"),
  density: rawFields.density.default("comfortable"),
  showStats: rawFields.showStats.default(true),
  zoom: rawFields.zoom.default(100),
  grid: rawFields.grid.default(true),
  autosave: rawFields.autosave.default(true),
  confirmPublish: rawFields.confirmPublish.default(true),
  editorTheme: rawFields.editorTheme.default("dark"),
  reduceMotion: rawFields.reduceMotion.default(false),
  highContrast: rawFields.highContrast.default(false),
  compact: rawFields.compact.default(false),
  keyHints: rawFields.keyHints.default(true),
});

export const userPreferencesPatchSchema = z
  .object(rawFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one preference field is required.");

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type UserPreferencesPatch = z.infer<typeof userPreferencesPatchSchema>;

export const DEFAULT_PREFERENCES: UserPreferences = userPreferencesSchema.parse({});

/** Safely parses arbitrary JSON from Supabase or localStorage into a complete, valid UserPreferences object. */
export function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PREFERENCES };
  const input = raw as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  const shape = userPreferencesSchema.shape;
  for (const key of Object.keys(shape) as Array<keyof typeof shape>) {
    if (key in input) {
      const res = shape[key].safeParse(input[key]);
      if (res.success) cleaned[key] = res.data;
    }
  }
  return userPreferencesSchema.parse(cleaned);
}

/** Maps the user's preferred landing page label to its real application route. */
export function landingPathFor(landing: UserPreferences["landing"]): string {
  switch (landing) {
    case "My Bots":
      return "/bots";
    case "Analytics":
      return "/analytics";
    default:
      return "/dashboard";
  }
}

export function localeForLanguage(language: UserPreferences["language"]): string {
  switch (language) {
    case "English (UK)":
      return "en-GB";
    case "English (India)":
      return "en-IN";
    case "English (US)":
    case "English":
    default:
      return "en-US";
  }
}

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Formats a date according to the user's `dateFormat`, `timezone`, and `language`. */
export function formatUserDate(value: Date | string | number, prefs: Pick<UserPreferences, "dateFormat" | "timezone" | "language">): string {
  const d = toDate(value);
  if (!d) return "";
  const tz = prefs.timezone;
  if (prefs.dateFormat === "MMM DD, YYYY") {
    return new Intl.DateTimeFormat(localeForLanguage(prefs.language), {
      month: "short",
      day: "2-digit",
      year: "numeric",
      timeZone: tz,
    }).format(d);
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: tz,
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  if (prefs.dateFormat === "YYYY-MM-DD") {
    return `${map.year}-${map.month}-${map.day}`;
  }
  return `${map.day}/${map.month}/${map.year}`;
}

/** Formats a time according to the user's `timeFormat` (12h/24h) and `timezone`. */
export function formatUserTime(value: Date | string | number, prefs: Pick<UserPreferences, "timeFormat" | "timezone" | "language">): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeForLanguage(prefs.language), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: prefs.timeFormat === "12-hour",
    timeZone: prefs.timezone,
  }).format(d);
}

/** Formats combined date & time honoring `dateFormat`, `timeFormat`, `timezone`, and `language`. */
export function formatUserDateTime(
  value: Date | string | number,
  prefs: Pick<UserPreferences, "dateFormat" | "timeFormat" | "timezone" | "language">,
): string {
  const date = formatUserDate(value, prefs);
  const time = formatUserTime(value, prefs);
  return date && time ? `${date}, ${time}` : date || time;
}

/** Formats numbers according to the user's regional language locale (e.g. 1,234.56 vs 1,23,456.78). */
export function formatUserNumber(value: number, prefs: Pick<UserPreferences, "language">): string {
  return new Intl.NumberFormat(localeForLanguage(prefs.language), { maximumFractionDigits: 2 }).format(value);
}

/** Returns ordered 3-letter weekday abbreviations starting on the user's preferred First Day of Week. */
export function orderedWeekdays(firstDay: UserPreferences["firstDay"]): string[] {
  return firstDay === "Sunday"
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

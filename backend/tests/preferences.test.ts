import { describe, it } from "node:test";
import { expect } from "./expect";
import {
  DEFAULT_PREFERENCES,
  formatUserDate,
  formatUserDateTime,
  formatUserNumber,
  formatUserTime,
  landingPathFor,
  localeForLanguage,
  orderedWeekdays,
  parsePreferences,
  userPreferencesPatchSchema,
} from "../src/lib/preferences";

describe("user preferences schema & formatting", () => {
  it("parses partial or legacy Supabase rows safely and fills defaults including theme", () => {
    const parsed = parsePreferences({
      timezone: "UTC",
      zoom: 120,
      compact: true,
      keyHints: false,
      unknownExtraKey: "ignored",
      zoomInvalid: "bad",
    });
    expect(parsed.theme).toBe("dark");
    expect(parsed.timezone).toBe("UTC");
    expect(parsed.zoom).toBe(120);
    expect(parsed.compact).toBe(true);
    expect(parsed.keyHints).toBe(false);
    expect(parsed.showStats).toBe(DEFAULT_PREFERENCES.showStats);
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it("validates preference patches and rejects invalid ranges or empty patches", () => {
    expect(userPreferencesPatchSchema.safeParse({}).success).toBe(false);
    expect(userPreferencesPatchSchema.safeParse({ zoom: 300 }).success).toBe(false);
    expect(userPreferencesPatchSchema.safeParse({ theme: "neon" }).success).toBe(false);
    expect(
      userPreferencesPatchSchema.safeParse({
        theme: "light",
        density: "compact",
        editorTheme: "contrast",
        confirmPublish: false,
        landing: "My Bots",
      }).success,
    ).toBe(true);
    // Partial patch must ONLY contain supplied keys (never overwrite unrelated settings with defaults).
    expect(userPreferencesPatchSchema.parse({ theme: "light" })).toEqual({ theme: "light" });
  });

  it("maps landing pages, locales, and first day of week accurately", () => {
    expect(landingPathFor("Dashboard")).toBe("/dashboard");
    expect(landingPathFor("My Bots")).toBe("/bots");
    expect(landingPathFor("Analytics")).toBe("/analytics");
    expect(localeForLanguage("English (India)")).toBe("en-IN");
    expect(localeForLanguage("English (UK)")).toBe("en-GB");
    expect(orderedWeekdays("Monday")[0]).toBe("Mon");
    expect(orderedWeekdays("Sunday")[0]).toBe("Sun");
  });

  it("formats dates, times, and numbers according to timezone, dateFormat, timeFormat, and language", () => {
    const sample = "2026-11-25T16:30:00Z";
    expect(formatUserDate(sample, { dateFormat: "YYYY-MM-DD", timezone: "UTC", language: "English" })).toBe("2026-11-25");
    expect(formatUserDate(sample, { dateFormat: "DD/MM/YYYY", timezone: "UTC", language: "English" })).toBe("25/11/2026");
    expect(formatUserDate(sample, { dateFormat: "MMM DD, YYYY", timezone: "UTC", language: "English" })).toBe("Nov 25, 2026");
    expect(formatUserTime(sample, { timeFormat: "24-hour", timezone: "UTC", language: "English" })).toBe("16:30");
    expect(formatUserTime(sample, { timeFormat: "12-hour", timezone: "UTC", language: "English" })).toContain("04:30");
    expect(formatUserTime(sample, { timeFormat: "24-hour", timezone: "Asia/Kolkata", language: "English" })).toBe("22:00");
    expect(formatUserDateTime(sample, { dateFormat: "YYYY-MM-DD", timeFormat: "24-hour", timezone: "UTC", language: "English" })).toBe("2026-11-25, 16:30");
    expect(formatUserNumber(123456.78, { language: "English (US)" })).toBe("123,456.78");
    expect(formatUserNumber(123456.78, { language: "English (India)" })).toBe("1,23,456.78");
  });
});

import { describe, it } from "node:test";
import { expect } from "./expect";
import { isValidCron, nextRun } from "../src/lib/cron";
const iso = (d: Date | null) => d?.toISOString() ?? null;
describe("cron", () => {
  it("validates expressions", () => {
    expect(isValidCron("0 9 * * *")).toBe(true);
    expect(isValidCron("*/15 0-6 1,15 * 1-5")).toBe(true);
    expect(isValidCron("60 * * * *")).toBe(false);
    expect(isValidCron("* * * *")).toBe(false);
    expect(isValidCron("*/0 * * * *")).toBe(false);
  });
  it("finds the next run in UTC, strictly after the given time", () => {
    expect(iso(nextRun("0 9 * * *", new Date("2026-03-10T08:59:00Z")))).toBe("2026-03-10T09:00:00.000Z");
    expect(iso(nextRun("0 9 * * *", new Date("2026-03-10T09:00:00Z")))).toBe("2026-03-11T09:00:00.000Z");
    expect(iso(nextRun("*/5 * * * *", new Date("2026-03-10T10:03:30Z")))).toBe("2026-03-10T10:05:00.000Z");
  });
  it("handles weekdays, month days and rare dates", () => {
    // 2026-03-14 is a Saturday; the next Monday is the 16th.
    expect(iso(nextRun("30 8 * * 1", new Date("2026-03-14T00:00:00Z")))).toBe("2026-03-16T08:30:00.000Z");
    expect(iso(nextRun("0 0 29 2 *", new Date("2026-03-01T00:00:00Z")))).toBe("2028-02-29T00:00:00.000Z");
    expect(nextRun("0 0 31 2 *", new Date("2026-03-01T00:00:00Z"))).toBe(null);
  });
  it("respects the time zone", () => {
    // Asia/Kolkata is UTC+5:30 with no daylight saving: 09:00 there is 03:30 UTC.
    expect(iso(nextRun("0 9 * * *", new Date("2026-03-10T00:00:00Z"), "Asia/Kolkata"))).toBe("2026-03-10T03:30:00.000Z");
    // New York is UTC-4 after the 8 March 2026 change: 09:00 local is 13:00 UTC.
    expect(iso(nextRun("0 9 * * *", new Date("2026-03-10T00:00:00Z"), "America/New_York"))).toBe("2026-03-10T13:00:00.000Z");
  });
  it("rejects unknown zones", () => {
    expect(nextRun("0 9 * * *", new Date(), "Mars/Base")).toBe(null);
  });
});

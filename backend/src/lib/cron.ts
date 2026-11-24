/**
 * Minimal 5-field cron: minute hour day-of-month month day-of-week.
 * Supports `*`, lists (1,15), ranges (1-5), and steps (star/5, 10-30/5). Day-of-week 0 or 7 is Sunday.
 * When both day-of-month and day-of-week are restricted, either may match (standard cron behaviour).
 * Pure code with no Node APIs, so it runs in the browser, on Node and on Cloudflare Workers.
 */
export interface CronSpec {
  minutes: number[]; hours: number[]; daysOfMonth: Set<number>; months: Set<number>; daysOfWeek: Set<number>;
  domAny: boolean; dowAny: boolean;
}
const FIELDS: [string, number, number][] = [["minute", 0, 59], ["hour", 0, 23], ["day of month", 1, 31], ["month", 1, 12], ["day of week", 0, 7]];
function parseField(src: string, min: number, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of src.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) return null;
    const range = m[1]!;
    let lo: number, hi: number;
    if (range === "*") { lo = min; hi = max; }
    else if (range.includes("-")) { [lo, hi] = range.split("-").map(Number) as [number, number]; }
    else { lo = Number(range); hi = m[2] ? max : lo; }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}
export function parseCron(expr: string): CronSpec | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const f = parts.map((p, i) => parseField(p, FIELDS[i]![1], FIELDS[i]![2]));
  if (f.some((x) => !x)) return null;
  const [minutes, hours, dom, months, dow] = f as number[][];
  return {
    minutes: minutes!, hours: hours!, daysOfMonth: new Set(dom), months: new Set(months), daysOfWeek: new Set(dow!.map((d) => d % 7)),
    domAny: parts[2] === "*", dowAny: parts[4] === "*",
  };
}
export const isValidCron = (expr: string) => parseCron(expr) !== null;
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(tz, f);
  }
  return f;
}
export function isValidTimezone(tz: string): boolean {
  try { formatter(tz); return true; } catch { return false; }
}
/** Wall-clock fields of an instant in a time zone. */
function localParts(ms: number, tz: string) {
  const p: Record<string, number> = {};
  for (const x of formatter(tz).formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year!, mo: p.month!, d: p.day!, h: p.hour!, mi: p.minute!, s: p.second! };
}
const offsetMs = (ms: number, tz: string) => {
  const l = localParts(ms, tz);
  return Date.UTC(l.y, l.mo - 1, l.d, l.h, l.mi, l.s) - Math.floor(ms / 1000) * 1000;
};
/** The instant at which the wall clock in `tz` reads the given time, or null when that time does not exist (DST gap). */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number | null {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(t, tz);
  if (second !== t) t = second;
  const l = localParts(t, tz);
  return l.y === y && l.mo === mo && l.d === d && l.h === h && l.mi === mi ? t : null;
}
/** The first run strictly after `after`, or null for an invalid cron, zone, or a schedule that never fires (such as 31 February). */
export function nextRun(expr: string, after: Date, tz = "UTC"): Date | null {
  const c = parseCron(expr);
  if (!c || !isValidTimezone(tz)) return null;
  const start = localParts(after.getTime(), tz);
  for (let i = 0; i <= 366 * 5; i++) {
    const day = new Date(Date.UTC(start.y, start.mo - 1, start.d + i));
    const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate(), dow = day.getUTCDay();
    if (!c.months.has(mo)) continue;
    const domOk = c.daysOfMonth.has(d), dowOk = c.daysOfWeek.has(dow);
    if (!(c.domAny || c.dowAny ? domOk && dowOk : domOk || dowOk)) continue;
    for (const h of c.hours) for (const mi of c.minutes) {
      const t = zonedToUtc(y, mo, d, h, mi, tz);
      if (t !== null && t > after.getTime()) return new Date(t);
    }
  }
  return null;
}

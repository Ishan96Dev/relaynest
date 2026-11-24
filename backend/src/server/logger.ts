import "server-only";

export type LogSection = "frontend" | "backend" | "api" | "db" | "auth" | "llm" | "vector" | "queue";
export type LogLevel = "info" | "warn" | "error";

export interface ConsoleLogEntry {
  id: string;
  ts: string;
  section: LogSection;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_LOGS = 500;
const g = globalThis as { __rnLogs?: ConsoleLogEntry[] };
const store = (): ConsoleLogEntry[] => (g.__rnLogs ??= []);

/** Records a structured log entry in the in-memory ring buffer and mirrors it to stdout/stderr. */
export function logEvent(section: LogSection, level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: ConsoleLogEntry = {
    id: crypto.randomUUID().slice(0, 8),
    ts: new Date().toISOString(),
    section,
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  const list = store();
  list.unshift(entry);
  if (list.length > MAX_LOGS) list.length = MAX_LOGS;
  const line = `[${section}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function getConsoleLogs(section?: string, level?: string): ConsoleLogEntry[] {
  return store().filter((e) => (!section || section === "all" || e.section === section) && (!level || level === "all" || e.level === level));
}

export function clearConsoleLogs() {
  store().length = 0;
}

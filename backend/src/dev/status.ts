/**
 * Backend dev supervisor (run by `pnpm dev` next to the web app, restarted by `tsx watch` when backend code changes).
 * The API itself runs inside the Next.js server (route handlers under frontend/src/app/api), so this process
 * verifies the backend's prerequisites and runs its test suite, giving immediate feedback while you edit.
 */
import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

const root = path.resolve(__dirname, "../../..");
loadEnvConfig(root, true, { info: () => {}, error: console.error });

const c = { dim: "\x1b[2m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", reset: "\x1b[0m" };
const ok = (m: string) => console.log(`${c.green}  ok ${c.reset} ${m}`);
const warn = (m: string) => console.log(`${c.yellow}  !! ${c.reset} ${m}`);
const bad = (m: string) => console.log(`${c.red}  xx ${c.reset} ${m}`);

const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
});

async function probe(url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    return { status: res.status, body: await res.text().catch(() => "") };
  } catch (e) {
    return { status: 0, body: e instanceof Error ? e.message : "network error" };
  }
}

async function main() {
  console.log(`\n${c.dim}RelayNest backend checks${c.reset}`);
  const parsed = env.safeParse(process.env);
  const missing = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];

  if (missing.length === 0) ok("Environment variables are valid");
  else {
    for (const k of missing) (k === "ENCRYPTION_KEY" ? warn : bad)(`${k} is missing or invalid${k === "ENCRYPTION_KEY" ? " (bot creation stays disabled until set; generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")" : ""}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    const health = await probe(`${url}/auth/v1/health`, { apikey: key });
    if (health.status === 200) ok("Supabase Auth is reachable");
    else bad(`Supabase Auth is not reachable (status ${health.status || "network error"}). Check NEXT_PUBLIC_SUPABASE_URL and the key.`);

    const table = await probe(`${url}/rest/v1/workspaces?select=id&limit=1`, { apikey: key, authorization: `Bearer ${key}` });
    if (table.status === 200 || table.status === 401 || table.status === 403) ok("Database schema is applied (workspaces table found)");
    else if (table.status === 404 || /PGRST20[0-9]/.test(table.body)) warn("Database tables not found. Apply supabase/migrations/*.sql (see docs/LOCAL_DEVELOPMENT.md).");
    else bad(`Could not query the database (status ${table.status || "network error"}).`);
  } else {
    warn("Supabase is not configured: the app runs in demo mode with sample data.");
  }

  console.log(`\n${c.dim}Running backend tests${c.reset}`);
  const tsxCli = path.join(root, "node_modules/tsx/dist/cli.mjs");
  const files = (await import("node:fs")).readdirSync(path.join(root, "backend/tests")).filter((f) => f.endsWith(".test.ts")).map((f) => path.join(root, "backend/tests", f));
  const test = spawn(process.execPath, [tsxCli, "--tsconfig", path.join(root, "frontend/tsconfig.json"), "--conditions", "react-server", "--test", "--test-reporter=spec", ...files], { stdio: "inherit", cwd: root });
  test.on("exit", (code) => console.log(code === 0 ? `\n${c.green}Backend ready.${c.reset} Watching backend/ for changes...\n` : `\n${c.red}Backend tests failed.${c.reset} Fix and save to re-run.\n`));
}

void main();
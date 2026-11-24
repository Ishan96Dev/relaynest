// Runs standard `next build frontend` normally, and automatically builds the
// OpenNext Cloudflare Workers bundle (`frontend/.open-next/worker.js`) when
// running inside Cloudflare Workers Builds (`WORKERS_CI`) or via `pnpm build:cloudflare`.
import { spawnSync } from "node:child_process";

const forceCloudflare = process.argv.includes("--cloudflare");
const isWorkersCi = ["1", "true", "yes"].includes(String(process.env.WORKERS_CI ?? "").toLowerCase());
const useCloudflare = forceCloudflare || isWorkersCi;

const cmdArgs = useCloudflare
  ? ["exec", "opennextjs-cloudflare", "build"]
  : ["exec", "next", "build", "frontend"];

console.log(
  `[build] Target: ${useCloudflare ? "Cloudflare Workers (@opennextjs/cloudflare)" : "Next.js (frontend)"}`,
);

const res = spawnSync("pnpm", cmdArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

process.exit(res.status ?? 1);

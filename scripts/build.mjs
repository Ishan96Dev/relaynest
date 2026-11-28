// Runs standard `next build frontend` normally, and automatically builds the
// OpenNext Cloudflare Workers bundle (`frontend/.open-next/worker.js`) when
// running inside Cloudflare Workers Builds (`WORKERS_CI`) or via `pnpm build:cloudflare`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const forceCloudflare = process.argv.includes("--cloudflare");
const isVercel = ["1", "true", "yes"].includes(String(process.env.VERCEL ?? "").toLowerCase());
const isWorkersCi = ["1", "true", "yes"].includes(String(process.env.WORKERS_CI ?? "").toLowerCase());
const useCloudflare = forceCloudflare || (isWorkersCi && !isVercel);

const cmdArgs = useCloudflare
  ? ["exec", "opennextjs-cloudflare", "build"]
  : ["exec", "next", "build", "frontend"];

console.log(
  `[build] Target: ${useCloudflare ? "Cloudflare Workers (@opennextjs/cloudflare)" : "Next.js (frontend)"}`,
);

const buildEnv = useCloudflare
  ? { ...process.env, RELAYNEST_DEPLOY_TARGET: "cloudflare" }
  : process.env;

// `sharp` is a dev-only asset script dependency (`pnpm images`). Hide its root link during
// OpenNext Cloudflare esbuild bundling so Next's unused image-optimizer never pulls native `.node` binaries into workerd.
const rootSharp = path.resolve("node_modules", "sharp");
const hiddenSharp = path.resolve("node_modules", ".sharp-offline-only");
let hidSharp = false;
if (useCloudflare && fs.existsSync(rootSharp) && !fs.existsSync(hiddenSharp)) {
  try {
    fs.renameSync(rootSharp, hiddenSharp);
    hidSharp = true;
  } catch {
    // ignore on read-only FS
  }
}

let exitCode = 1;
try {
  const res = spawnSync("pnpm", cmdArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: buildEnv,
  });
  exitCode = res.status ?? 1;
} finally {
  if (hidSharp && fs.existsSync(hiddenSharp) && !fs.existsSync(rootSharp)) {
    try {
      fs.renameSync(hiddenSharp, rootSharp);
    } catch {
      // ignore
    }
  }
}

process.exit(exitCode);

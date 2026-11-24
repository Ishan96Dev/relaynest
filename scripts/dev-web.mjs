// Launches the Next.js dev server targeting port 3000 (or PORT env var).
// Checks default/IPv4/IPv6 sockets so dual-stack/IPv6 listeners (:::3000) are detected
// cleanly, supports explicit -H/--hostname (e.g. `pnpm dev:3000` -> 127.0.0.1:3000),
// and falls back cleanly to the next free port when needed.
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next", { paths: [path.resolve(process.cwd())] });

const extraArgs = process.argv.slice(2).filter((a) => a !== "--");

function parseHost(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "-H" || arg === "--hostname") && argv[i + 1]) return argv[i + 1];
    if (arg.startsWith("--hostname=")) return arg.slice("--hostname=".length);
  }
  return process.env.HOSTNAME?.trim() || process.env.HOST?.trim() || null;
}

function canBind(port, host) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();
    tester.once("error", (err) => {
      // Treat missing IPv6 stack as non-blocking while strictly catching EADDRINUSE/EACCES.
      if (host === "::" && err && (err.code === "EAFNOSUPPORT" || err.code === "EADDRNOTAVAIL")) {
        resolve(true);
        return;
      }
      resolve(false);
    });
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(host ? { port, host, ipv6Only: host === "::" } : { port });
  });
}

async function isPortAvailable(port, explicitHost) {
  if (explicitHost) return canBind(port, explicitHost);
  return (await canBind(port, undefined)) && (await canBind(port, "0.0.0.0")) && (await canBind(port, "::"));
}

async function pickPort(preferred, explicitHost) {
  for (let p = preferred; p < preferred + 10; p++) {
    if (await isPortAvailable(p, explicitHost)) return p;
  }
  return preferred;
}

const explicitHost = parseHost(extraArgs);
const preferredPort = Number(process.env.PORT || 3000);
const chosenPort = await pickPort(preferredPort, explicitHost);

if (chosenPort !== preferredPort) {
  const ipv4Free = !explicitHost && (await canBind(preferredPort, "127.0.0.1"));
  console.warn(
    `[dev:web] Port ${preferredPort} is currently occupied on ${ipv4Free ? "IPv6 (:::3000)" : "this machine"}; starting RelayNest on http://localhost:${chosenPort} instead.`,
  );
  if (ipv4Free) {
    console.warn(
      `[dev:web] IPv4 127.0.0.1:${preferredPort} is free: run "pnpm dev:3000" (or "npm run dev:3000") for http://127.0.0.1:${preferredPort}, or stop the service holding :::${preferredPort} for http://localhost:${preferredPort}.`,
    );
  } else {
    console.warn(`[dev:web] Free port ${preferredPort} to run RelayNest directly on http://localhost:${preferredPort}.`);
  }
}

const args = [nextBin, "dev", "frontend", "--turbopack", "-p", String(chosenPort), ...extraArgs];
const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });

let signaled = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    signaled = true;
    child.kill(sig);
  });
}

child.on("exit", (code, signal) => {
  if (signal) process.exit(signaled ? 0 : 1);
  process.exit(code ?? 0);
});

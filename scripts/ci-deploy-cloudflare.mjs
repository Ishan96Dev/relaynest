#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function statusLabel(value) {
  return value ? "set" : "missing";
}

function maskSecret(value) {
  if (value && process.env.GITHUB_ACTIONS === "true") {
    console.log(`::add-mask::${value}`);
  }
}

function appendSummary(lines, env = process.env) {
  const summaryPath = clean(env.GITHUB_STEP_SUMMARY);
  const content = `${lines.join("\n")}\n`;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, content, "utf8");
  }
}

export function readWorkerName(repoRoot = process.cwd()) {
  const configPath = path.join(repoRoot, "wrangler.jsonc");
  if (!fs.existsSync(configPath)) return "relaynest";
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const match = raw.match(/"name"\s*:\s*"([^"]+)"/);
    return match?.[1]?.trim() || "relaynest";
  } catch {
    return "relaynest";
  }
}

export function resolveCloudflareConfig(env = process.env, repoRoot = process.cwd()) {
  return {
    apiToken: clean(env.CLOUDFLARE_API_TOKEN),
    accountId: clean(env.CLOUDFLARE_ACCOUNT_ID),
    deployHookUrl: clean(env.CLOUDFLARE_DEPLOY_HOOK_URL),
    pagesProject: clean(env.CLOUDFLARE_PAGES_PROJECT),
    workerName: readWorkerName(repoRoot),
    commitSha: clean(env.GITHUB_SHA).slice(0, 7) || "local",
  };
}

export async function discoverCloudflareAccountId(apiToken, workerName, fetchImpl = fetch) {
  if (!apiToken) return null;
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
  try {
    const res = await fetchImpl(`${CF_API_BASE}/accounts?per_page=50`, { headers });
    if (!res.ok) return null;
    const json = await res.json();
    const accounts = Array.isArray(json?.result) ? json.result : [];
    if (accounts.length === 0) return null;
    if (accounts.length === 1 && clean(accounts[0]?.id)) {
      return clean(accounts[0].id);
    }
    for (const acc of accounts) {
      const id = clean(acc?.id);
      if (!id) continue;
      const probe = await fetchImpl(
        `${CF_API_BASE}/accounts/${encodeURIComponent(id)}/workers/scripts/${encodeURIComponent(workerName)}`,
        { headers },
      ).catch(() => null);
      if (probe?.ok) return id;
    }
    return clean(accounts[0]?.id) || null;
  } catch {
    return null;
  }
}

export async function triggerDeployHook(hookUrl, fetchImpl = fetch) {
  let parsed;
  try {
    parsed = new URL(hookUrl);
  } catch {
    throw new Error("CLOUDFLARE_DEPLOY_HOOK_URL is not a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("CLOUDFLARE_DEPLOY_HOOK_URL must use https://.");
  }
  const res = await fetchImpl(hookUrl, { method: "POST" });
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Cloudflare deploy hook failed with HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return { status: res.status };
}

function runCmd(command, args, env, label) {
  console.log(`[cloudflare] ${label}`);
  const res = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (res.error) throw res.error;
  if ((res.status ?? 1) !== 0) {
    throw new Error(`${label} failed with exit code ${res.status ?? 1}`);
  }
}

export async function runCloudflareDeploy({
  env = process.env,
  fetchImpl = fetch,
  execCmd = runCmd,
  repoRoot = process.cwd(),
} = {}) {
  const cfg = resolveCloudflareConfig(env, repoRoot);

  console.log("Cloudflare CI credential check:");
  console.log(`  CLOUDFLARE_API_TOKEN: ${statusLabel(cfg.apiToken)}`);
  console.log(`  CLOUDFLARE_ACCOUNT_ID: ${statusLabel(cfg.accountId)}`);
  console.log(`  CLOUDFLARE_DEPLOY_HOOK_URL: ${statusLabel(cfg.deployHookUrl)}`);
  if (cfg.pagesProject) {
    console.log(`  CLOUDFLARE_PAGES_PROJECT: ${cfg.pagesProject}`);
  }

  let accountId = cfg.accountId;
  if (cfg.apiToken && !accountId) {
    console.log("[cloudflare] CLOUDFLARE_ACCOUNT_ID not provided; auto-discovering via Cloudflare API...");
    const discovered = await discoverCloudflareAccountId(cfg.apiToken, cfg.workerName, fetchImpl);
    if (discovered) {
      accountId = discovered;
      maskSecret(accountId);
      console.log("[cloudflare] Auto-discovered CLOUDFLARE_ACCOUNT_ID from API token.");
    } else if (cfg.deployHookUrl) {
      console.log(
        "::warning title=Cloudflare Account Auto-Discovery Skipped::Token could not list accounts (missing Account Settings:Read); falling back to CLOUDFLARE_DEPLOY_HOOK_URL.",
      );
      const hookRes = await triggerDeployHook(cfg.deployHookUrl, fetchImpl);
      appendSummary(
        [
          "### Cloudflare Workers Deployed (Deploy Hook Fallback)",
          `- Commit: \`${cfg.commitSha}\``,
          `- Target: \`${cfg.workerName}\` (Workers Builds Deploy Hook, HTTP ${hookRes.status})`,
          "- Tip: Add `CLOUDFLARE_ACCOUNT_ID` in Repository Secrets/Variables to deploy directly via Wrangler instead of the hook.",
        ],
        env,
      );
      return { mode: "hook", status: hookRes.status };
    }
  }

  if (cfg.apiToken) {
    const childEnv = {
      ...env,
      CLOUDFLARE_API_TOKEN: cfg.apiToken,
      ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
    };

    execCmd("pnpm", ["install", "--frozen-lockfile"], childEnv, "Installing dependencies");
    execCmd("pnpm", ["build:cloudflare"], childEnv, "Building OpenNext Cloudflare Workers bundle");
    execCmd(
      "pnpm",
      ["exec", "wrangler", "deploy", "--keep-vars"],
      childEnv,
      `Deploying Worker (${cfg.workerName}) with --keep-vars`,
    );

    if (cfg.pagesProject) {
      execCmd(
        "pnpm",
        ["exec", "wrangler", "pages", "deploy", "frontend/.open-next/assets", `--project-name=${cfg.pagesProject}`],
        childEnv,
        `Syncing static assets to Cloudflare Pages (${cfg.pagesProject})`,
      );
    }

    appendSummary(
      [
        "### Cloudflare Workers Deployed",
        `- Commit: \`${cfg.commitSha}\``,
        `- Target: \`${cfg.workerName}\` (OpenNext + Wrangler \`--keep-vars\`)`,
        ...(cfg.pagesProject ? [`- Pages Assets: \`${cfg.pagesProject}\``] : []),
      ],
      env,
    );
    return { mode: "wrangler", accountId };
  }

  if (cfg.deployHookUrl) {
    console.log("[cloudflare] Triggering Cloudflare Workers Builds deploy hook...");
    const hookRes = await triggerDeployHook(cfg.deployHookUrl, fetchImpl);
    console.log(`[cloudflare] Deploy hook triggered successfully (HTTP ${hookRes.status}).`);
    appendSummary(
      [
        "### Cloudflare Workers Deployed (Deploy Hook)",
        `- Commit: \`${cfg.commitSha}\``,
        `- Target: \`${cfg.workerName}\` (Workers Builds Deploy Hook, HTTP ${hookRes.status})`,
      ],
      env,
    );
    return { mode: "hook", status: hookRes.status };
  }

  console.log(
    "::warning title=Cloudflare CI Secrets Missing::Add CLOUDFLARE_API_TOKEN (account ID is auto-discovered) OR CLOUDFLARE_DEPLOY_HOOK_URL under GitHub Repo Settings -> Secrets and variables -> Actions -> Repository secrets.",
  );
  appendSummary(
    [
      "### Cloudflare Workers CI Deploy Not Configured Yet",
      `- \`CLOUDFLARE_API_TOKEN\`: ${statusLabel(cfg.apiToken)}`,
      `- \`CLOUDFLARE_ACCOUNT_ID\`: ${statusLabel(cfg.accountId)} *(optional — auto-discovered when token has Account Read)*`,
      `- \`CLOUDFLARE_DEPLOY_HOOK_URL\`: ${statusLabel(cfg.deployHookUrl)}`,
      "",
      "Add **either one** of these in **Settings -> Secrets and variables -> Actions -> Repository secrets**:",
      "- `CLOUDFLARE_API_TOKEN` *(+ optional `CLOUDFLARE_ACCOUNT_ID`)* — builds OpenNext in CI and runs `wrangler deploy --keep-vars`",
      "- OR `CLOUDFLARE_DEPLOY_HOOK_URL` — triggers Cloudflare Workers Builds directly",
      "",
      "> Note: App `.env` secrets (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, etc.) are application variables, not Cloudflare deployment credentials. If Cloudflare Workers Builds GitHub integration already deploys `main` automatically, set `CLOUDFLARE_DEPLOY=false` in Repository Variables.",
    ],
    env,
  );
  return { mode: "missing" };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runCloudflareDeploy().catch((err) => {
    console.error(`[cloudflare] Deploy error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

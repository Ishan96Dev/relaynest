#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERCEL_API_BASE = "https://api.vercel.com";

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

export function resolveVercelConfig(env = process.env) {
  const repoFull = clean(env.GITHUB_REPOSITORY);
  const repoName = repoFull.includes("/") ? repoFull.split("/").pop() : "relaynest";
  return {
    token: clean(env.VERCEL_TOKEN),
    orgId: clean(env.VERCEL_ORG_ID),
    projectId: clean(env.VERCEL_PROJECT_ID),
    deployHookUrl: clean(env.VERCEL_DEPLOY_HOOK_URL),
    repoFull,
    repoName: repoName || "relaynest",
    commitSha: clean(env.GITHUB_SHA).slice(0, 7) || "local",
  };
}

export function matchVercelProject(
  candidates,
  { projectHint = "", repoFull = "", repoName = "relaynest", allowSingleFallback = true } = {},
) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const hintLower = projectHint.toLowerCase();
  const repoFullLower = repoFull.toLowerCase();
  const repoNameLower = repoName.toLowerCase();

  if (hintLower) {
    const byHint = candidates.find(
      ({ project }) =>
        clean(project?.id).toLowerCase() === hintLower ||
        clean(project?.name).toLowerCase() === hintLower,
    );
    if (byHint) return byHint;
  }

  if (repoFullLower) {
    const byGitRepo = candidates.find(({ project }) => {
      const org = clean(project?.link?.org);
      const repo = clean(project?.link?.repo);
      if (org && repo && `${org}/${repo}`.toLowerCase() === repoFullLower) return true;
      const slug = clean(project?.link?.repoPath);
      return Boolean(slug && slug.toLowerCase() === repoFullLower);
    });
    if (byGitRepo) return byGitRepo;
  }

  if (repoNameLower) {
    const byRepoName = candidates.find(({ project }) => clean(project?.name).toLowerCase() === repoNameLower);
    if (byRepoName) return byRepoName;
  }

  if (allowSingleFallback && candidates.length === 1) return candidates[0];
  return null;
}

async function vercelApiGet(pathname, token, fetchImpl) {
  const res = await fetchImpl(`${VERCEL_API_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  const data = await res.json().catch(() => null);
  return { ok: true, status: res.status, data };
}

export async function discoverVercelIds(cfg, fetchImpl = fetch) {
  if (!cfg.token) return null;

  const userRes = await vercelApiGet("/v2/user", cfg.token, fetchImpl);
  if (!userRes.ok) {
    throw new Error(`VERCEL_TOKEN authentication failed (HTTP ${userRes.status}). Verify the token is valid and not expired.`);
  }
  const userId = clean(userRes.data?.user?.id);

  const teamsRes = await vercelApiGet("/v2/teams?limit=50", cfg.token, fetchImpl);
  const teams = Array.isArray(teamsRes.data?.teams) ? teamsRes.data.teams : [];

  // Normalize team slug if user passed a team slug in VERCEL_ORG_ID / VERCEL_TEAM_ID
  let resolvedHintOrgId = cfg.orgId;
  if (resolvedHintOrgId && !resolvedHintOrgId.startsWith("team_") && resolvedHintOrgId !== userId) {
    const matchedTeam = teams.find(
      (t) => clean(t?.slug).toLowerCase() === resolvedHintOrgId.toLowerCase(),
    );
    if (matchedTeam?.id) resolvedHintOrgId = clean(matchedTeam.id);
  }

  const scopeTeamIds = [];
  if (resolvedHintOrgId.startsWith("team_")) scopeTeamIds.push(resolvedHintOrgId);
  scopeTeamIds.push(null); // personal account
  for (const t of teams) {
    const id = clean(t?.id);
    if (id && !scopeTeamIds.includes(id)) scopeTeamIds.push(id);
  }

  const candidates = [];
  for (const teamId of scopeTeamIds) {
    const qs = teamId ? `?limit=100&teamId=${encodeURIComponent(teamId)}` : "?limit=100";
    const projRes = await vercelApiGet(`/v9/projects${qs}`, cfg.token, fetchImpl);
    if (!projRes.ok) continue;
    const list = Array.isArray(projRes.data?.projects) ? projRes.data.projects : [];
    for (const project of list) {
      candidates.push({ project, teamId });
    }
    const earlyMatch = matchVercelProject(candidates, {
      projectHint: cfg.projectId,
      repoFull: cfg.repoFull,
      repoName: cfg.repoName,
      allowSingleFallback: false,
    });
    if (earlyMatch) {
      return {
        orgId: clean(earlyMatch.teamId) || clean(earlyMatch.project?.accountId) || userId,
        projectId: clean(earlyMatch.project?.id),
        projectName: clean(earlyMatch.project?.name),
      };
    }
  }

  const matched = matchVercelProject(candidates, {
    projectHint: cfg.projectId,
    repoFull: cfg.repoFull,
    repoName: cfg.repoName,
  });
  if (!matched) return null;

  return {
    orgId: clean(matched.teamId) || clean(matched.project?.accountId) || userId,
    projectId: clean(matched.project?.id),
    projectName: clean(matched.project?.name),
  };
}

export function extractDeploymentUrl(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i].match(/https:\/\/[^\s]+/);
    if (match) return match[0];
  }
  return "";
}

export async function triggerVercelHook(hookUrl, fetchImpl = fetch) {
  let parsed;
  try {
    parsed = new URL(hookUrl);
  } catch {
    throw new Error("VERCEL_DEPLOY_HOOK_URL is not a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("VERCEL_DEPLOY_HOOK_URL must use https://.");
  }
  const res = await fetchImpl(hookUrl, { method: "POST" });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Vercel deploy hook failed with HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  let jobId = "";
  let jobState = "";
  try {
    const parsedJson = JSON.parse(text);
    jobId = clean(parsedJson?.job?.id);
    jobState = clean(parsedJson?.job?.state);
  } catch {
    // non-JSON response is fine
  }
  return { status: res.status, jobId, jobState };
}

function runCmd(command, args, env, label, { captureStdout = false } = {}) {
  console.log(`[vercel] ${label}`);
  const res = spawnSync(command, args, {
    stdio: captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
    encoding: captureStdout ? "utf8" : undefined,
    env,
  });
  if (res.error) throw res.error;
  if (captureStdout && res.stdout) {
    process.stdout.write(res.stdout);
  }
  if ((res.status ?? 1) !== 0) {
    throw new Error(`${label} failed with exit code ${res.status ?? 1}`);
  }
  return captureStdout ? String(res.stdout ?? "") : "";
}

export async function runVercelDeploy({
  env = process.env,
  fetchImpl = fetch,
  execCmd = runCmd,
} = {}) {
  const cfg = resolveVercelConfig(env);

  console.log("Vercel CI credential check:");
  console.log(`  VERCEL_TOKEN: ${statusLabel(cfg.token)}`);
  console.log(`  VERCEL_ORG_ID: ${statusLabel(cfg.orgId)}`);
  console.log(`  VERCEL_PROJECT_ID: ${statusLabel(cfg.projectId)}`);
  console.log(`  VERCEL_DEPLOY_HOOK_URL: ${statusLabel(cfg.deployHookUrl)}`);

  if (cfg.token) {
    let orgId = cfg.orgId;
    let projectId = cfg.projectId;
    let projectName = "";

    const needsDiscovery = !orgId || !projectId || !projectId.startsWith("prj_");
    if (needsDiscovery) {
      console.log("[vercel] Auto-discovering Vercel Org ID & Project ID via Vercel API...");
      const discovered = await discoverVercelIds(cfg, fetchImpl);
      if (discovered?.orgId && discovered?.projectId) {
        orgId = discovered.orgId;
        projectId = discovered.projectId;
        projectName = discovered.projectName || "";
        maskSecret(orgId);
        maskSecret(projectId);
        console.log(`[vercel] Resolved Vercel project${projectName ? ` (${projectName})` : ""} automatically.`);
      } else if (cfg.deployHookUrl) {
        console.log(
          "::warning title=Vercel Project Not Found via Token::Could not match project via VERCEL_TOKEN; falling back to VERCEL_DEPLOY_HOOK_URL.",
        );
        const hookRes = await triggerVercelHook(cfg.deployHookUrl, fetchImpl);
        appendSummary(
          [
            "### Vercel Production Deploy Triggered (Deploy Hook Fallback)",
            `- Commit: \`${cfg.commitSha}\``,
            `- HTTP Status: ${hookRes.status}${hookRes.jobId ? ` (Job \`${hookRes.jobId}\` ${hookRes.jobState})` : ""}`,
          ],
          env,
        );
        return { mode: "hook", ...hookRes };
      } else {
        throw new Error(
          `VERCEL_TOKEN is valid, but no matching Vercel project was found for "${cfg.repoFull || cfg.repoName}". Import the repo in Vercel or set VERCEL_ORG_ID + VERCEL_PROJECT_ID.`,
        );
      }
    }

    const childEnv = {
      ...env,
      VERCEL_ORG_ID: orgId,
      VERCEL_PROJECT_ID: projectId,
    };

    execCmd("pnpm", ["install", "--frozen-lockfile"], childEnv, "Installing dependencies");
    execCmd(
      "pnpm",
      ["dlx", "vercel@latest", "pull", "--yes", "--environment=production", `--token=${cfg.token}`],
      childEnv,
      "Pulling Vercel production project settings & environment",
    );
    execCmd(
      "pnpm",
      ["dlx", "vercel@latest", "build", "--prod", `--token=${cfg.token}`],
      childEnv,
      "Building prebuilt Vercel production output",
    );
    const stdout = execCmd(
      "pnpm",
      ["dlx", "vercel@latest", "deploy", "--prebuilt", "--prod", `--token=${cfg.token}`],
      childEnv,
      "Deploying prebuilt output to Vercel production",
      { captureStdout: true },
    );

    const deployUrl = extractDeploymentUrl(stdout);
    appendSummary(
      [
        "### Vercel Production Deployed",
        `- Commit: \`${cfg.commitSha}\``,
        ...(projectName ? [`- Project: \`${projectName}\``] : []),
        ...(deployUrl ? [`- URL: ${deployUrl}`] : []),
      ],
      env,
    );
    return { mode: "cli", orgId, projectId, deployUrl };
  }

  if (cfg.deployHookUrl) {
    console.log("[vercel] Triggering Vercel production deploy hook...");
    const hookRes = await triggerVercelHook(cfg.deployHookUrl, fetchImpl);
    console.log(
      `[vercel] Deploy hook triggered successfully (HTTP ${hookRes.status}${hookRes.jobId ? `, job ${hookRes.jobId}` : ""}).`,
    );
    appendSummary(
      [
        "### Vercel Production Deploy Triggered (Deploy Hook)",
        `- Commit: \`${cfg.commitSha}\``,
        `- HTTP Status: ${hookRes.status}${hookRes.jobId ? ` (Job \`${hookRes.jobId}\` ${hookRes.jobState})` : ""}`,
      ],
      env,
    );
    return { mode: "hook", ...hookRes };
  }

  console.log(
    "::warning title=Vercel CI Secrets Missing::Add VERCEL_TOKEN (org & project IDs are auto-discovered) OR VERCEL_DEPLOY_HOOK_URL under GitHub Repo Settings -> Secrets and variables -> Actions -> Repository secrets.",
  );
  appendSummary(
    [
      "### Vercel Synced CI Deploy Not Configured Yet",
      `- \`VERCEL_TOKEN\`: ${statusLabel(cfg.token)}`,
      `- \`VERCEL_ORG_ID\`: ${statusLabel(cfg.orgId)} *(optional — auto-discovered from \`VERCEL_TOKEN\`)*`,
      `- \`VERCEL_PROJECT_ID\`: ${statusLabel(cfg.projectId)} *(optional — auto-discovered from \`VERCEL_TOKEN\`)*`,
      `- \`VERCEL_DEPLOY_HOOK_URL\`: ${statusLabel(cfg.deployHookUrl)}`,
      "",
      "Add **either one** of these in **Settings -> Secrets and variables -> Actions -> Repository secrets**:",
      "- `VERCEL_TOKEN` *(Account Settings -> Tokens; Org ID & Project ID are auto-discovered)*",
      "- OR `VERCEL_DEPLOY_HOOK_URL` *(Project Settings -> Git -> Deploy Hooks)*",
      "",
      "> Note: App `.env` secrets (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `AI_GATEWAY_API_KEY`, etc.) are application variables, not Vercel deployment credentials. If Vercel's GitHub integration already deploys `main` automatically, set `VERCEL_DEPLOY=false` in Repository Variables.",
    ],
    env,
  );
  return { mode: "missing" };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runVercelDeploy().catch((err) => {
    console.error(`[vercel] Deploy error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

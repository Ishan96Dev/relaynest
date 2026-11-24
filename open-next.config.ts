import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

export default {
  ...config,
  // RelayNest hosts Next.js inside `frontend/` with dependencies hoisted at repo root.
  appPath: "frontend",
  buildOutputPath: "frontend",
  packageJsonPath: "package.json",
  buildCommand: "pnpm exec next build frontend",
};

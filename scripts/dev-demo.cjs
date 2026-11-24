// Starts the Next.js dev server in demo mode: Supabase variables are blanked so every screen
// renders with sample data and no credentials. Usage: pnpm dev:demo
const { spawn } = require("node:child_process");
const path = require("node:path");

const next = require.resolve("next/dist/bin/next", { paths: [path.resolve(__dirname, "..")] });
const port = process.env.PORT || "3300";

spawn(process.execPath, [next, "dev", "frontend", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SECRET_KEY: "" },
}).on("exit", (code) => process.exit(code ?? 0));

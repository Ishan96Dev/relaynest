#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];
const passes = [];

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (["node_modules", ".next", ".next-prod", ".open-next"].includes(ent.name)) continue;
      walk(p, exts, out);
    } else if (exts.some((e) => ent.name.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
}

const frontendFiles = walk(path.join(ROOT, "frontend/src"), [".ts", ".tsx"]);
const backendFiles = walk(path.join(ROOT, "backend/src"), [".ts", ".tsx"]);
const allCodeFiles = [...frontendFiles, ...backendFiles];

// -----------------------------------------------------------------------------
// 1. VA / CA Security Audit Pointers
// -----------------------------------------------------------------------------
const nextCfg = fs.readFileSync(path.join(ROOT, "frontend/next.config.ts"), "utf8");
for (const hdr of [
  "poweredByHeader: false",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
  "Content-Security-Policy",
  "frame-ancestors 'none'",
  "object-src 'none'",
]) {
  if (!nextCfg.includes(hdr)) errors.push(`[VA/CA] Missing security header/config in next.config.ts: ${hdr}`);
}
if (nextCfg.includes('source: "/features"') || nextCfg.includes('source: "/templates"')) {
  errors.push("[Routing] next.config.ts contains hijack redirect overriding /features or /templates");
}

for (const file of allCodeFiles) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");

  // Check reverse tabnabbing on target="_blank"
  const blankMatches = [...src.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)];
  for (const m of blankMatches) {
    if (!/rel="[^"]*\bnoopener\b[^"]*"/.test(m[0])) {
      errors.push(`[VA/CA CWE-1022] ${rel}: target="_blank" link missing rel="noopener noreferrer"`);
    }
  }

  // Check dangerous DOM sinks outside safe root theme script
  if (/\beval\s*\(/.test(src) || /\bnew Function\s*\(/.test(src) || /\.innerHTML\s*=/.test(src)) {
    errors.push(`[VA/CA XSS] ${rel}: unsafe dynamic code execution or innerHTML sink detected`);
  }
  if (src.includes("dangerouslySetInnerHTML") && rel.replaceAll("\\", "/") !== "frontend/src/app/layout.tsx") {
    errors.push(`[VA/CA XSS] ${rel}: unexpected dangerouslySetInnerHTML usage`);
  }

  // Check accidental secret tokens
  if (/\bsk_live_[A-Za-z0-9]{16,}\b/.test(src) || /\b\d{9,11}:AA[A-Za-z0-9_-]{30,}\b/.test(src)) {
    errors.push(`[VA/CA Secrets] ${rel}: hardcoded live secret or Telegram token detected`);
  }
}
passes.push("VA/CA Security Scan (CSP, HSTS, X-Frame-Options, Permissions-Policy, XSS/Sinks, Tabnabbing, Secrets)");

// -----------------------------------------------------------------------------
// 2. WCAG 2.1 AA Accessibility Audit
// -----------------------------------------------------------------------------
const rootLayout = fs.readFileSync(path.join(ROOT, "frontend/src/app/layout.tsx"), "utf8");
if (!/<html\s+lang="en"/.test(rootLayout)) errors.push("[WCAG 3.1.1] Root layout missing <html lang=\"en\">");

const marketingLayout = fs.readFileSync(path.join(ROOT, "frontend/src/app/(marketing)/layout.tsx"), "utf8");
const dashShell = fs.readFileSync(path.join(ROOT, "frontend/src/components/layout/dashboard-shell.tsx"), "utf8");
for (const [name, content] of [["marketing/layout.tsx", marketingLayout], ["dashboard-shell.tsx", dashShell]]) {
  if (!content.includes('href="#main"')) errors.push(`[WCAG 2.4.1] ${name} missing Skip to Content link`);
  if (!content.includes('<main id="main"')) errors.push(`[WCAG 1.3.1] ${name} missing <main id="main"> landmark`);
}

const globalsCss = fs.readFileSync(path.join(ROOT, "frontend/src/app/globals.css"), "utf8");
if (!globalsCss.includes(":focus-visible")) errors.push("[WCAG 2.4.7] globals.css missing :focus-visible outline rule");

for (const file of frontendFiles.filter((f) => f.endsWith(".tsx"))) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");
  const imgTags = [...src.matchAll(/<(img|Image)\b[^>]*>/g)];
  for (const m of imgTags) {
    if (!/\balt\s*=/.test(m[0])) errors.push(`[WCAG 1.1.1] ${rel}: <img>/<Image> tag missing alt attribute`);
  }
  if (src.includes('href="#"')) errors.push(`[WCAG 2.4.4] ${rel}: dead href="#" link found`);
}
passes.push("WCAG 2.1 AA Accessibility Scan (Lang, Skip-Links, Landmarks, Focus-Visible, Alt Text, Valid Links)");

// -----------------------------------------------------------------------------
// 3. GIGW (Guidelines for Indian Government Websites / Public SaaS Standard) & Version Sync
// -----------------------------------------------------------------------------
const requiredPublicPages = [
  "privacy/page.tsx",
  "terms/page.tsx",
  "terms-of-use/page.tsx",
  "website-policy/page.tsx",
  "disclaimer/page.tsx",
  "responsible-ai/page.tsx",
  "feedback/page.tsx",
  "contact/page.tsx",
  "about/page.tsx",
  "docs/page.tsx",
  "guides/page.tsx",
  "features/page.tsx",
  "templates/page.tsx",
  "compliance/page.tsx",
  "api-reference/page.tsx",
];
for (const p of requiredPublicPages) {
  if (!fs.existsSync(path.join(ROOT, "frontend/src/app/(marketing)", p))) {
    errors.push(`[GIGW Compliance] Missing mandatory public/policy page: (marketing)/${p}`);
  }
}

if (!fs.existsSync(path.join(ROOT, "docs/GIGW_VACA_ACCESSIBILITY.md"))) {
  errors.push("[GIGW Compliance] Missing developer compliance standard: docs/GIGW_VACA_ACCESSIBILITY.md");
}

const dashFooterSrc = fs.readFileSync(path.join(ROOT, "frontend/src/components/layout/dashboard-shell.tsx"), "utf8");
if (!dashFooterSrc.includes("LEGAL_STRIP_LINKS")) {
  errors.push("[GIGW Compliance] Authenticated DashboardShell footer must surface LEGAL_STRIP_LINKS policy navigation");
}
if (!fs.existsSync(path.join(ROOT, "frontend/src/app/(dashboard)/api-docs/page.tsx"))) {
  errors.push("[App Architecture] Missing authenticated in-app Swagger page: (dashboard)/api-docs/page.tsx");
}
const apiMgrSrc = fs.readFileSync(path.join(ROOT, "frontend/src/components/settings/api-keys-manager.tsx"), "utf8");
const intHubSrc = fs.readFileSync(path.join(ROOT, "frontend/src/components/integrations/integrations-hub.tsx"), "utf8");
if (/\bGIGW\b/i.test(apiMgrSrc) || /\bGIGW\b/i.test(intHubSrc)) {
  errors.push("[UX Hygiene] Internal GIGW labels must stay out of API Keys and Integrations UI");
}

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const appVersionHelper = fs.readFileSync(path.join(ROOT, "frontend/src/lib/app-version.ts"), "utf8");
const docsVersions = fs.readFileSync(path.join(ROOT, "frontend/src/data/docs-versions.ts"), "utf8");
if (
  !nextCfg.includes("package.json") ||
  !nextCfg.includes("NEXT_PUBLIC_APP_VERSION") ||
  !appVersionHelper.includes("NEXT_PUBLIC_APP_VERSION") ||
  !appVersionHelper.includes(`"${rootPkg.version}"`) ||
  !docsVersions.includes("APP_VERSION")
) {
  errors.push("[Version Sync] APP_VERSION must sync package.json via next.config.ts NEXT_PUBLIC_APP_VERSION with Docs");
}
if (/import\s+[^;]*\.json["']/.test(appVersionHelper) || /require\([^)]*\.json["']\)/.test(appVersionHelper)) {
  errors.push("[Turbopack HMR] Do not directly import .json files in frontend/src/lib/app-version.ts");
}
if (!rootPkg.version) errors.push("[Version Sync] Root package.json version missing");

passes.push(`GIGW Compliance & Version Sync (All 13 Public/Policy Pages + App/Docs v${rootPkg.version} Lockstep)`);

console.log("=== RelayNest Accessibility, GIGW & VA/CA Security Gate ===");
for (const p of passes) console.log(`  PASS: ${p}`);
if (errors.length > 0) {
  console.error("\nFAILURES DETECTED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nALL COMPLIANCE & SECURITY CHECKS PASSED (0 issues).");

import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// The app lives in /frontend but secrets live in the repo-root .env, so load them from there.
loadEnvConfig(path.resolve(__dirname, ".."), process.env.NODE_ENV !== "production", console, true);

const repoRoot = path.resolve(__dirname, "..");
const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version?: string };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: rootPkg.version || "0.1.0",
  },
  // Lets a production build run beside a dev server without overwriting its .next folder (NEXT_DIST_DIR=.next-prod).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The server code lives in /backend, outside this app directory. Point tracing and Turbopack at the repo root.
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // Cloudflare Workers serves static assets from the edge CDN directly without a Workers Images binding;
  // disabling Next.js runtime /_next/image proxying avoids waking the Worker isolate on every image request.
  images: {
    unoptimized: Boolean(
      process.env.WORKERS_CI ||
        process.env.CF_PAGES ||
        process.env.RELAYNEST_DEPLOY_TARGET === "cloudflare",
    ),
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "@xyflow/react"],
    // Keep visited dynamic pages in the client router cache for 30 s, so going back to a page is instant.
    // Saves call router.refresh(), which clears the cache, so edits still show immediately.
    staleTimes: { dynamic: 30, static: 180 },
  },
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/use-cases", destination: "/guides", permanent: false },
    ];
  },
  async headers() {
    const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${devEval} https://www.googletagmanager.com https://checkout.razorpay.com https://*.razorpay.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://*.razorpay.com",
      "media-src 'self' blob:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;

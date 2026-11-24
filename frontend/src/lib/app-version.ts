/**
 * Single source of truth for RelayNest app and current documentation version.
 * Injected at build/dev time from root package.json via frontend/next.config.ts
 * so Turbopack HMR never tracks an external JSON module in the browser graph.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";
export const APP_VERSION_TAG = `v${APP_VERSION}`;

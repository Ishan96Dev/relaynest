import "server-only";
import { cookies } from "next/headers";
import { safeEqual } from "@backend/lib/crypto";
import { Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { logEvent } from "@backend/server/logger";

export const ADMIN_COOKIE = "rn_admin_session";
const SESSION_TTL_MS = 12 * 3_600_000;
const enc = new TextEncoder();

export function envAdminEmail(): string | undefined {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || undefined;
}

export function envAdminPasswordHash(): string | undefined {
  return process.env.ADMIN_PASSWORD_HASH?.trim() || undefined;
}

export function envAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD?.trim() || undefined;
}

/** PBKDF2-SHA256 password hashing (100,000 iterations, WebCrypto compatible on Node and Cloudflare Workers). */
export async function hashAdminPassword(password: string, saltHex?: string, iterations = 100_000): Promise<string> {
  const safeIterations = Math.min(Math.max(Math.trunc(iterations), 10_000), 100_000);
  const salt = saltHex
    ? Uint8Array.from((saltHex.match(/.{2}/g) ?? []).map((b) => Number.parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: safeIterations }, key, 256));
  const toHex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${safeIterations}$${toHex(salt)}$${toHex(bits)}`;
}

async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1] ?? "100000", 10);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 100_000) return false;
  const candidate = await hashAdminPassword(password, parts[2], iterations);
  return safeEqual(candidate, stored);
}

function signingSecret(): string {
  const key = process.env.ENCRYPTION_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new Error("Admin session signing requires ENCRYPTION_KEY or SUPABASE_SECRET_KEY.");
  return `relaynest-admin-session-v2:${key}`;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(signingSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Checks whether at least one DB admin row or backend env admin credential is configured. */
export async function adminConfigured(): Promise<boolean> {
  if (envAdminEmail() && (envAdminPasswordHash() || envAdminPassword())) return true;
  try {
    const { count } = await createAdminClient().from("platform_admins").select("id", { count: "exact", head: true }).eq("active", true);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Verifies admin credentials against Supabase `platform_admins` first, then falls back to backend env
 * (`ADMIN_EMAIL` + `ADMIN_PASSWORD`, used on Cloudflare Workers or local bootstrap). Nothing is hardcoded.
 */
export async function verifyAdminCredentials(email: string, password: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;

  try {
    const db = createAdminClient();
    const { data } = await db.from("platform_admins").select("id, email, password_hash, active").eq("email", normalized).maybeSingle();
    if (data) {
      if (!data.active) return null;
      const ok = await verifyPasswordHash(password, data.password_hash as string);
      if (ok) {
        await db.from("platform_admins").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);
        logEvent("auth", "info", "Admin login succeeded (DB)", { email: normalized });
        return normalized;
      }
      logEvent("auth", "warn", "Failed admin login attempt (DB)", { email: normalized });
      return null;
    }
  } catch {
    // Table may not exist before migration; fall through to env check.
  }

  const expectedEmail = envAdminEmail();
  const expectedHash = envAdminPasswordHash();
  const expectedPass = envAdminPassword();
  const matchedHash = Boolean(expectedHash && (await verifyPasswordHash(password, expectedHash)));
  const matchedPlain = Boolean(expectedPass && safeEqual(password, expectedPass));
  if (expectedEmail && safeEqual(normalized, expectedEmail) && (matchedHash || matchedPlain)) {
    // Bootstrap hashed credential into platform_admins so PBKDF2-SHA256 verification persists cleanly in DB.
    try {
      const hash = expectedHash ?? (await hashAdminPassword(password));
      await createAdminClient().from("platform_admins").upsert({ email: normalized, password_hash: hash, active: true, last_login_at: new Date().toISOString() }, { onConflict: "email" });
    } catch {
      // Optional sync.
    }
    logEvent("auth", "info", "Admin login succeeded (env)", { email: normalized });
    return normalized;
  }

  logEvent("auth", "warn", "Failed admin login attempt", { email: normalized });
  return null;
}

export async function createAdminSessionCookie(email: string): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${email.toLowerCase()}|${exp}`;
  const sig = await sign(payload);
  return Buffer.from(`${payload}|${sig}`, "utf8").toString("base64url");
}

export async function getAdminSession(): Promise<{ email: string } | null> {
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length !== 3) return null;
    const [email, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!email || !Number.isFinite(exp) || Date.now() > exp) return null;
    const expected = await sign(`${email}|${expStr}`);
    if (!safeEqual(sig ?? "", expected)) return null;
    return { email };
  } catch {
    return null;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  return Boolean(await getAdminSession());
}

export async function requireAdmin(): Promise<{ email: string }> {
  const session = await getAdminSession();
  if (!session) throw Errors.unauthenticated();
  return session;
}

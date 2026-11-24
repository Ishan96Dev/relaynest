// Creates or updates an admin account in Supabase `platform_admins` without putting credentials in code.
// Usage: node --env-file=.env scripts/set-admin.mjs <email> <password>
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node --env-file=.env scripts/set-admin.mjs <email> <password>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.");
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 }, baseKey, 256));
const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
const password_hash = `pbkdf2$100000$${hex(salt)}$${hex(bits)}`;

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await db.from("platform_admins").upsert({ email: email.trim().toLowerCase(), password_hash, active: true }, { onConflict: "email" });
if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}
console.log(`Admin saved in platform_admins: ${email.trim().toLowerCase()}`);

// Ensures the public Supabase Storage bucket `brand` exists and uploads
// `frontend/public/brand/logo-icon-128.png` so Supabase Auth & transactional
// email templates always render a reliable public HTTPS logo (Gmail/Outlook safe).
//
// Run: pnpm emails:logo
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = path.join(rootDir, "frontend", "public", "brand", "logo-icon-128.png");
const BUCKET = "brand";
const OBJECT_PATH = "logo-icon-128.png";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in environment/.env.");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const { data: existing, error: getErr } = await sb.storage.getBucket(BUCKET);
if (!existing) {
  const { error: createErr } = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 1048576,
    allowedMimeTypes: ["image/png", "image/webp", "image/jpeg"],
  });
  if (createErr) {
    console.error(`Failed to create public bucket "${BUCKET}": ${createErr.message} (${getErr?.message ?? ""})`);
    process.exit(1);
  }
  console.log(`Created public Supabase Storage bucket "${BUCKET}".`);
} else if (!existing.public) {
  const { error: updErr } = await sb.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: 1048576,
    allowedMimeTypes: ["image/png", "image/webp", "image/jpeg"],
  });
  if (updErr) {
    console.error(`Failed to make bucket "${BUCKET}" public: ${updErr.message}`);
    process.exit(1);
  }
}

const bytes = readFileSync(logoPath);
const { error: uploadErr } = await sb.storage.from(BUCKET).upload(OBJECT_PATH, bytes, {
  contentType: "image/png",
  cacheControl: "31536000",
  upsert: true,
});
if (uploadErr) {
  console.error(`Failed to upload ${OBJECT_PATH} to "${BUCKET}": ${uploadErr.message}`);
  process.exit(1);
}

const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(OBJECT_PATH);
const publicUrl = urlData.publicUrl;

const verify = await fetch(publicUrl, { method: "HEAD" });
if (!verify.ok) {
  console.error(`Uploaded logo URL returned HTTP ${verify.status}: ${publicUrl}`);
  process.exit(1);
}

console.log(`Uploaded RelayNest logo to Supabase Storage (HTTP ${verify.status}, ${verify.headers.get("content-type")}):`);
console.log(publicUrl);

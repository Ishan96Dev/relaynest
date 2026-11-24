// Generates the optimized web images in frontend/public from the full-size originals in docs/design/source.
// Run with: pnpm images
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => path.join(root, "docs/design/source", f);
const pub = (f) => path.join(root, "frontend/public", f);

const jobs = [
  // Brand
  [src("brand-logo-icon.png"), pub("brand/logo-icon-128.png"), (s) => s.resize(128, 128).png({ compressionLevel: 9 })],
  [src("brand-logo-icon.png"), pub("brand/logo-icon-512.png"), (s) => s.resize(512, 512).png({ compressionLevel: 9 })],
  [src("brand-logo-tagline.png"), pub("brand/logo-horizontal.webp"), (s) => s.resize({ width: 1200 }).webp({ quality: 85 })],
  [src("brand-logo-monochrome.png"), pub("brand/logo-monochrome.webp"), (s) => s.resize({ width: 1200 }).webp({ quality: 85 })],
  [src("brand-wordmark-banner.png"), pub("brand/og-image.png"), (s) => s.resize(1200, 630, { fit: "contain", background: "#000000" }).png({ compressionLevel: 9, palette: true })],
  // Marketing / app imagery
  [src("dashboard-preview.png"), pub("images/dashboard-preview.webp"), (s) => s.resize({ width: 1400 }).webp({ quality: 82 })],
  [src("docs-hero.png"), pub("images/docs-hero.webp"), (s) => s.resize({ width: 1600 }).webp({ quality: 82 })],
  [src("telegram-badge.png"), pub("images/telegram-badge.webp"), (s) => s.resize({ width: 560 }).webp({ quality: 85 })],
  // Auth artwork
  [src("auth-login.png"), pub("images/auth/auth-login.webp"), (s) => s.webp({ quality: 82 })],
  [src("auth-signup.png"), pub("images/auth/auth-signup.webp"), (s) => s.webp({ quality: 82 })],
  [src("auth-reset-password.png"), pub("images/auth/auth-reset-password.webp"), (s) => s.webp({ quality: 82 })],
  // The forgot-password panel only exists at low resolution in the mockups, so it is upscaled.
  [src("auth-forgot-password.png"), pub("images/auth/auth-forgot-password.webp"), (s) => s.resize({ width: 1100, kernel: "lanczos3" }).sharpen({ sigma: 0.8 }).webp({ quality: 88 })],
];

for (const [from, to, fn] of jobs) {
  await mkdir(path.dirname(to), { recursive: true });
  const info = await fn(sharp(from)).toFile(to);
  console.log(`${path.relative(root, to).padEnd(52)} ${(info.size / 1024).toFixed(0).padStart(5)} KB`);
}

// Favicon set from the ribbon-loop icon: PNG sizes, Apple/Android icons, and a multi-size ICO.
const fav = src("brand-favicon.png");
const sizes = { "favicon-16x16.png": 16, "favicon-32x32.png": 32, "favicon-48x48.png": 48, "apple-touch-icon.png": 180, "android-chrome-192x192.png": 192, "android-chrome-512x512.png": 512 };
const pngs = {};
for (const [name, size] of Object.entries(sizes)) {
  const buf = await sharp(fav).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  pngs[size] = buf;
  await writeFile(pub(name), buf);
  console.log(`${path.relative(root, pub(name)).padEnd(52)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB`);
}
// ICO container with embedded PNGs (supported by all current browsers).
const frames = [16, 32, 48].map((s) => pngs[s]);
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = 6 + 16 * frames.length;
const entries = frames.map((buf, i) => {
  const size = [16, 32, 48][i];
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0); e.writeUInt8(size, 1); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
  offset += buf.length;
  return e;
});
const ico = Buffer.concat([header, ...entries, ...frames]);
await writeFile(path.join(root, "frontend/src/app/favicon.ico"), ico);
console.log(`${"frontend/src/app/favicon.ico".padEnd(52)} ${(ico.length / 1024).toFixed(0).padStart(5)} KB`);
await writeFile(pub("site.webmanifest"), JSON.stringify({
  name: "RelayNest", short_name: "RelayNest", description: "No-code Telegram bot builder and workflow automation.",
  start_url: "/dashboard", display: "standalone", background_color: "#08081A", theme_color: "#08081A",
  icons: [{ src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" }, { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }],
}, null, 2) + "\n");
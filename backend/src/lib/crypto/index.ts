/**
 * AES-256-GCM using WebCrypto so it runs on Node and Cloudflare Workers.
 * Format: `<formatVersion>.<keyVersion>.<base64 iv>.<base64 ciphertext+tag>`
 */
const FORMAT = "v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Encryption key must be 64 hex characters.");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function importKey(hexKey: string, usage: KeyUsage) {
  return crypto.subtle.importKey("raw", hexToBytes(hexKey), "AES-GCM", false, [usage]);
}

export async function encryptSecret(plaintext: string, hexKey: string, keyVersion = "v1"): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(hexKey, "encrypt");
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(keyVersion) }, key, enc.encode(plaintext)),
  );
  return [FORMAT, keyVersion, b64(iv), b64(ct)].join(".");
}

export async function decryptSecret(payload: string, hexKey: string): Promise<string> {
  const [format, keyVersion, iv, ct] = payload.split(".");
  if (format !== FORMAT || !keyVersion || !iv || !ct) throw new Error("Unsupported ciphertext format.");
  const key = await importKey(hexKey, "decrypt");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv), additionalData: enc.encode(keyVersion) },
    key,
    unb64(ct),
  );
  return dec.decode(pt);
}

/** Shows only the last 4 characters, e.g. `••••••••••:wXyZ`. */
export function maskToken(token: string): string {
  return `${"•".repeat(10)}${token.slice(-4)}`;
}

/** Constant-time string comparison for secrets such as webhook tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ea = enc.encode(a);
  const eb = enc.encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function randomToken(bytes = 24): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Computes HMAC-SHA256 hex signature prefixed with `sha256=` for signed outbound webhook deliveries. */
export async function signWebhookPayload(payloadJson: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payloadJson)));
  return `sha256=${Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Redacts secret webhook URL path segments so only the origin and trailing 4 chars remain visible. */
export function maskWebhookUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const tail = raw.length > 10 ? raw.slice(-4) : "";
    return `${u.origin}/•••${tail}`;
  } catch {
    return "https://•••";
  }
}

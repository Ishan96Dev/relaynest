import { assertNoPhishingUrlIndicators } from "@backend/lib/security/phishing";

/** SSRF & anti-phishing guard for external HTTP URLs. Rejects non-HTTPS, private/metadata IPs, and IDN homographs. */
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata", "instance-data"]);
const ALLOWED_PORTS = new Set(["", "443", "8443"]);

export function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:");
}

export function assertSafeOutboundUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed.");
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed.");
  if (!ALLOWED_PORTS.has(url.port)) throw new Error("Port is not allowed.");
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".localhost")) {
    throw new Error("Host is not allowed.");
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) throw new Error("Private addresses are not allowed.");
  // Numeric/hex/octal IPv4 forms that URL() normalises are caught above; reject any remaining all-numeric host.
  if (/^[0-9.]+$/.test(host)) throw new Error("Host is not allowed.");
  assertNoPhishingUrlIndicators(url);
  return url;
}

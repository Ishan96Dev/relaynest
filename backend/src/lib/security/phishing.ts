/**
 * Anti-phishing URL inspection, safe relative redirect validation, CSRF origin check,
 * and HTML escaping for transactional emails.
 */

const ZERO_WIDTH_OR_CONTROL = /[\u0000-\u001f\u007f\u200B-\u200D\uFEFF]/;

/** Escapes HTML special characters to block script and phishing link injection in HTML emails. */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validates that a post-auth redirect target is strictly same-origin relative,
 * blocking `//evil.com`, `/\evil.com`, encoded protocol tricks (`/%2f`), and `@` authority spoofing.
 */
export function sanitizeRedirectPath(input: string | null | undefined, fallback = "/dashboard"): string {
  if (!input || ZERO_WIDTH_OR_CONTROL.test(input)) return fallback;
  let candidate = input.trim();
  try {
    // Decode once to reject %2f%2fevil.com style bypasses
    const decoded = decodeURIComponent(candidate);
    if (decoded.startsWith("//") || decoded.includes("\\") || /^\/[a-z]+:/i.test(decoded)) {
      return fallback;
    }
    candidate = candidate;
  } catch {
    return fallback;
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\") || candidate.includes("\\")) {
    return fallback;
  }
  if (/^\/[^/?#]*@/.test(candidate) || /^\/https?:/i.test(candidate)) {
    return fallback;
  }
  return candidate;
}

/**
 * Flags deceptive phishing URL indicators: Punycode (`xn--` IDN homographs),
 * non-ASCII lookalike characters in domains, embedded credentials (`user@host`), or IP literals.
 */
export function assertNoPhishingUrlIndicators(url: URL): void {
  if (url.username || url.password) {
    throw new Error("Embedded URL credentials are blocked for anti-phishing safety.");
  }
  const host = url.hostname.toLowerCase();
  if (!host || ZERO_WIDTH_OR_CONTROL.test(host)) {
    throw new Error("URL hostname contains invalid control characters.");
  }
  // Block IDN punycode lookalike domains in automated webhook targets
  if (host.split(".").some((part) => part.startsWith("xn--"))) {
    throw new Error("Internationalized (Punycode) webhook hostnames are blocked to prevent lookalike phishing.");
  }
  // Reject non-ASCII homoglyphs if hostname failed punycode conversion
  if (/[^\x20-\x7e]/.test(host)) {
    throw new Error("Non-ASCII hostnames are not permitted.");
  }
  // Reject raw public IPv4 webhook targets (prevents unverified direct IP phishing relays)
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error("Use a verified HTTPS domain name rather than a raw IP address.");
  }
}

/** Checks Origin/Referer for browser state-changing requests to enforce same-site CSRF protection. */
export function hasTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // Non-browser CLI / API key callers omit Origin header
  try {
    const reqOriginHost = new URL(origin).host.toLowerCase();
    const hostHeader = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
    if (hostHeader && reqOriginHost === hostHeader) return true;
    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (configured && new URL(configured).host.toLowerCase() === reqOriginHost) return true;
    return false;
  } catch {
    return false;
  }
}

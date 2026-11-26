/**
 * Pure shared types and URL helpers for rich Link Preview cards & hover popovers.
 * Kept free of `server-only` so both frontend components and backend services can import it.
 */

export interface LinkPreviewData {
  url: string;
  domain: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

/** Validates that a URL is a clean public http(s) link safe for anchor hrefs. */
export function isSafeHttpUrl(raw: string | null | undefined): raw is string {
  if (!raw || typeof raw !== "string") return false;
  return /^https?:\/\/[^\s<>"]+$/i.test(raw.trim());
}

/** Returns a clean hostname without a leading `www.`. */
export function safeDisplayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "link";
  }
}

/** Returns a compact domain + path label suitable for link preview footers. */
export function safeDisplayPath(url: string, maxLen = 54): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "");
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
    const full = `${host}${path}`;
    return full.length > maxLen ? `${full.slice(0, maxLen - 3)}...` : full;
  } catch {
    return url.length > maxLen ? `${url.slice(0, maxLen - 3)}...` : url;
  }
}

/** Returns a high-resolution favicon URL via Google's public S2 favicon service for HTTPS domains. */
export function getFaviconUrl(domainOrUrl: string): string | undefined {
  let domain = domainOrUrl.trim();
  if (/^https?:\/\//i.test(domain)) {
    domain = safeDisplayDomain(domain);
  }
  domain = domain.replace(/^www\./i, "");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

/** Extracts a high-quality thumbnail URL directly for YouTube watch/shorts/youtu.be links. */
export function extractYoutubeThumbnail(rawUrl: string): string | undefined {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") {
      const seg = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
      if (/^[A-Za-z0-9_-]{11}$/.test(seg)) id = seg;
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) id = v;
      else {
        const m = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
        if (m?.[1]) id = m[1];
      }
    }
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
  } catch {
    return undefined;
  }
}

/** Normalizes a URL for deduplication (strips trailing slash and hash). */
export function normalizeLinkKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    u.hash = "";
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname.replace(/^www\./i, "").toLowerCase()}${path}${u.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Extracts unique safe `https://` links referenced in a Markdown message (both `[label](url)` and bare URLs),
 * preserving order of appearance while ignoring links inside fenced code blocks or inline code spans.
 */
export function extractExternalLinks(
  markdown: string,
  limit = 4,
): Array<{ url: string; label?: string }> {
  if (!markdown) return [];
  // Strip fenced code blocks and inline code spans so sample URLs in code aren't turned into preview cards.
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]{1,300}`/g, " ");

  const seen = new Set<string>();
  const out: Array<{ url: string; label?: string }> = [];
  const re = /\[([^\]]{1,200})\]\((https:\/\/[^)\s]{1,1000})\)|\b(https:\/\/[^\s<>()]+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(stripped)) !== null && out.length < limit) {
    const rawUrl = (m[2] ?? m[3] ?? "").trim().replace(/[.,;:!?)\]]+$/, "");
    if (!/^https:\/\/[^\s<>"]+$/i.test(rawUrl)) continue;
    const key = normalizeLinkKey(rawUrl);
    if (seen.has(key)) continue;
    seen.add(key);
    const label = m[1]?.trim();
    out.push({ url: rawUrl, ...(label && !/^https?:\/\//i.test(label) ? { label } : {}) });
  }

  return out;
}

import "server-only";
import {
  extractYoutubeThumbnail,
  getFaviconUrl,
  safeDisplayDomain,
  type LinkPreviewData,
} from "@backend/server/ai/link-preview-types";
import { assertSafeOutboundUrl } from "@backend/server/workflow-engine/ssrf";

const UA = "Mozilla/5.0 (compatible; RelayNestLinkPreview/1.0; +https://relaynest.app)";
const FETCH_TIMEOUT_MS = 3_500;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 65_536;
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  data: LinkPreviewData;
  expiresAt: number;
}

const previewCache = new Map<string, CacheEntry>();

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ent: string) => {
    if (ent[0] === "#") {
      const code =
        ent[1]?.toLowerCase() === "x"
          ? Number.parseInt(ent.slice(2), 16)
          : Number.parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : " ";
    }
    return HTML_ENTITIES[ent.toLowerCase()] ?? match;
  });
}

function cleanText(raw: string | undefined | null, maxLen: number): string | undefined {
  if (!raw) return undefined;
  const normalized = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 3).trimEnd()}...` : normalized;
}

function resolveSafeAssetUrl(raw: string | undefined | null, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = decodeHtmlEntities(raw).trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) return undefined;
  try {
    const resolved = new URL(trimmed, baseUrl).toString();
    return assertSafeOutboundUrl(resolved).toString();
  } catch {
    return undefined;
  }
}

/** Extracts the value of an attribute from an HTML opening tag string (supports single, double, or unquoted values). */
function readAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, "i");
  const m = re.exec(tag);
  return m?.[1] ?? m?.[2] ?? m?.[3];
}

/**
 * Pure OpenGraph / Twitter Card / HTML `<head>` metadata extractor.
 * Exported for unit testing and zero-dependency edge execution.
 */
export function parseLinkPreviewHtml(html: string, finalUrl: string): LinkPreviewData {
  const domain = safeDisplayDomain(finalUrl);
  const headEnd = html.search(/<\/head>/i);
  const scope = headEnd !== -1 ? html.slice(0, headEnd + 7) : html.slice(0, MAX_HTML_BYTES);

  const meta = new Map<string, string>();
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(scope)) !== null) {
    const tag = m[0];
    const key = (readAttr(tag, "property") ?? readAttr(tag, "name") ?? "").trim().toLowerCase();
    const content = readAttr(tag, "content")?.trim();
    if (key && content && !meta.has(key)) {
      meta.set(key, content);
    }
  }

  let iconHref: string | undefined;
  let appleIconHref: string | undefined;
  const linkRe = /<link\b[^>]*>/gi;
  while ((m = linkRe.exec(scope)) !== null) {
    const tag = m[0];
    const rel = (readAttr(tag, "rel") ?? "").toLowerCase();
    const href = readAttr(tag, "href")?.trim();
    if (!href) continue;
    if (!appleIconHref && rel.includes("apple-touch-icon")) {
      appleIconHref = href;
    } else if (!iconHref && /\bicon\b/.test(rel)) {
      iconHref = href;
    }
  }

  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(scope)?.[1];
  const title =
    cleanText(meta.get("og:title"), 160) ??
    cleanText(meta.get("twitter:title"), 160) ??
    cleanText(titleTag, 160) ??
    domain;

  const description =
    cleanText(meta.get("og:description"), 260) ??
    cleanText(meta.get("twitter:description"), 260) ??
    cleanText(meta.get("description"), 260);

  const siteName = cleanText(meta.get("og:site_name"), 80) ?? domain;

  const rawImage =
    meta.get("og:image:secure_url") ??
    meta.get("og:image") ??
    meta.get("twitter:image:src") ??
    meta.get("twitter:image");
  const image = resolveSafeAssetUrl(rawImage, finalUrl) ?? extractYoutubeThumbnail(finalUrl);

  const favicon =
    resolveSafeAssetUrl(appleIconHref ?? iconHref, finalUrl) ?? getFaviconUrl(domain);

  return {
    url: finalUrl,
    domain,
    title,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    siteName,
    ...(favicon ? { favicon } : {}),
  };
}

function buildFallbackPreview(url: string): LinkPreviewData {
  const domain = safeDisplayDomain(url);
  const ytThumb = extractYoutubeThumbnail(url);
  const favicon = getFaviconUrl(domain);
  return {
    url,
    domain,
    title: domain,
    siteName: domain,
    ...(ytThumb ? { image: ytThumb } : {}),
    ...(favicon ? { favicon } : {}),
  };
}

function getCached(url: string): LinkPreviewData | null {
  const entry = previewCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    previewCache.delete(url);
    return null;
  }
  return entry.data;
}

function setCached(url: string, data: LinkPreviewData) {
  if (previewCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = previewCache.keys().next().value;
    if (oldest) previewCache.delete(oldest);
  }
  previewCache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function readHeadChunk(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_HTML_BYTES);
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let text = "";
  try {
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(text)) break;
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text.slice(0, MAX_HTML_BYTES);
}

/**
 * Fetches OpenGraph / Twitter / HTML metadata for a public HTTPS URL with strict SSRF validation
 * across every redirect hop, bounded HTML reads, short timeout, and in-memory caching.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewData> {
  const validated = assertSafeOutboundUrl(rawUrl).toString();
  const cached = getCached(validated);
  if (cached) return cached;

  let currentUrl = validated;
  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": UA,
          accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
          "accept-language": "en-US,en;q=0.8",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!loc || hop === MAX_REDIRECTS) {
          const fallback = buildFallbackPreview(currentUrl);
          setCached(validated, fallback);
          return fallback;
        }
        const nextUrl = new URL(loc, currentUrl).toString();
        currentUrl = assertSafeOutboundUrl(nextUrl).toString();
        continue;
      }
      break;
    }

    if (!res || !res.ok) {
      await res?.body?.cancel().catch(() => {});
      const fallback = buildFallbackPreview(currentUrl);
      setCached(validated, fallback);
      return fallback;
    }

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("application/xhtml+xml")) {
      await res.body?.cancel().catch(() => {});
      const fallback = buildFallbackPreview(currentUrl);
      setCached(validated, fallback);
      return fallback;
    }

    const html = await readHeadChunk(res);
    const parsed = parseLinkPreviewHtml(html, currentUrl);
    setCached(validated, parsed);
    return parsed;
  } catch {
    const fallback = buildFallbackPreview(currentUrl);
    setCached(validated, fallback);
    return fallback;
  }
}

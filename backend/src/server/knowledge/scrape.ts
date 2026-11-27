import { gunzipSync } from "fflate";
import { assertSafeOutboundUrl } from "../workflow-engine/ssrf";
import { decodeEntities, extractFileText, htmlToText, kindFromContentType, KnowledgeError, MAX_TEXT_CHARS } from "./extract";

export type ScrapeMode = "single" | "sitemap" | "subpages";

export interface ScrapeConfig {
  maxPages?: number;
  maxDepth?: number;
  samePathPrefix?: boolean;
  pathPrefix?: string;
  excludePatterns?: string[];
}

export type ScrapeLogLevel = "info" | "success" | "warn" | "error";

export interface ScrapeLogEvent {
  level: ScrapeLogLevel;
  stage: string;
  message: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface ScrapeProgressEvent {
  stage: string;
  pagesTotal: number;
  pagesScraped: number;
  pagesFailed: number;
}

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  links: string[];
  via: "direct" | "direct-warmup" | "firecrawl" | "jina" | "tinyfish";
}

export interface ScrapeWebsiteResult {
  title: string;
  pages: ScrapedPage[];
  totalDiscovered: number;
  failedCount: number;
}

export interface ScrapeCallbacks {
  onLog?: (entry: ScrapeLogEvent) => void | Promise<void>;
  onProgress?: (progress: ScrapeProgressEvent) => void | Promise<void>;
}

const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_SITEMAP_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECT_HOPS = 8;
const MAX_PAGES_HARD_CAP = 50;
const PER_PAGE_TEXT_CAP = 60_000;
const REQUEST_TIMEOUT_MS = 18_000;
const READER_TIMEOUT_MS = 25_000;

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "upgrade-insecure-requests": "1",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
};

const SKIP_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff|css|js|mjs|cjs|map|woff2?|ttf|otf|eot|mp4|webm|mov|avi|mp3|wav|ogg|m4a|zip|tar|gz|rar|7z|dmg|exe|apk|iso)(?:$|\?)/i;

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
]);

/** Normalizes user input URLs (adds https:// if missing, upgrades http:// to https://) and enforces SSRF safety. */
export function normalizePublicUrl(raw: string): URL {
  let trimmed = raw.trim();
  if (!trimmed) throw new KnowledgeError("Enter a valid URL.");
  if (/^http:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed.slice(7)}`;
  } else if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    return assertSafeOutboundUrl(trimmed);
  } catch (e) {
    throw new KnowledgeError((e as Error).message || "This URL is not allowed.");
  }
}

export function canonicalizeUrl(raw: string): string | null {
  try {
    const u = assertSafeOutboundUrl(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(k.toLowerCase())) u.searchParams.delete(k);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return null;
  }
}

function registrableHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isSameSiteHost(candidate: string, allowedHosts: Set<string>): boolean {
  const norm = registrableHost(candidate);
  for (const h of allowedHosts) {
    if (norm === h || norm.endsWith(`.${h}`)) return true;
  }
  return false;
}

function concatBytes(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function readBodyLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const remaining = maxBytes - total;
    const slice = value.length > remaining ? value.subarray(0, remaining) : value;
    parts.push(slice);
    total += slice.length;
    if (total >= maxBytes) break;
  }
  void reader.cancel().catch(() => undefined);
  return concatBytes(parts, total);
}

function extractSetCookies(res: Response): string[] {
  const hdrs = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof hdrs.getSetCookie === "function") {
    return hdrs.getSetCookie().map((c) => c.split(";")[0]!.trim()).filter(Boolean);
  }
  const single = res.headers.get("set-cookie");
  if (!single) return [];
  // Split cookie headers safely without breaking Expires=Wed, 21 Oct...
  return single
    .split(/,(?=\s*[A-Za-z0-9_.-]+=)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter(Boolean);
}

function mergeCookies(jar: Map<string, string>, res: Response) {
  for (const pair of extractSetCookies(res)) {
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>): string | undefined {
  if (!jar.size) return undefined;
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Extracts clean public HTTPS links from raw HTML. */
export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const rawHref = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
    if (!rawHref || rawHref.startsWith("#") || /^(?:javascript|mailto|tel|data|blob):/i.test(rawHref)) continue;
    try {
      const resolved = new URL(rawHref, baseUrl);
      if (resolved.protocol === "http:") resolved.protocol = "https:";
      if (resolved.protocol !== "https:") continue;
      if (SKIP_EXTENSIONS.test(resolved.pathname)) continue;
      const canon = canonicalizeUrl(resolved.toString());
      if (canon) out.add(canon);
    } catch {
      // skip malformed href
    }
  }
  return [...out];
}

function extractLinksFromMarkdown(md: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const linkRe = /(?<!!)\[[^\]]+\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(md)) !== null) {
    try {
      const resolved = new URL(m[1]!, baseUrl);
      if (resolved.protocol === "http:") resolved.protocol = "https:";
      if (resolved.protocol !== "https:" || SKIP_EXTENSIONS.test(resolved.pathname)) continue;
      const canon = canonicalizeUrl(resolved.toString());
      if (canon) out.add(canon);
    } catch {
      // skip
    }
  }
  return [...out];
}

/** Parses XML `<urlset>` or `<sitemapindex>` documents into URL lists (exported for unit tests). */
export function parseSitemapXml(xml: string): { urls: string[]; childSitemaps: string[] } {
  const clean = xml.replace(/<!--[\s\S]*?-->/g, "");
  const urls: string[] = [];
  const childSitemaps: string[] = [];

  const smRe = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = smRe.exec(clean)) !== null) {
    const loc = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(sm[1]!)?.[1];
    if (loc) {
      const cleaned = decodeEntities(loc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
      if (cleaned) childSitemaps.push(cleaned);
    }
  }

  const urlRe = /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  let um: RegExpExecArray | null;
  while ((um = urlRe.exec(clean)) !== null) {
    const loc = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(um[1]!)?.[1];
    if (loc) {
      const cleaned = decodeEntities(loc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
      if (cleaned) urls.push(cleaned);
    }
  }

  // Fallback for plain XML with bare <loc> tags
  if (!urls.length && !childSitemaps.length) {
    const locRe = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = locRe.exec(clean)) !== null) {
      const cleaned = decodeEntities(lm[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
      if (cleaned) urls.push(cleaned);
    }
  }

  return { urls, childSitemaps };
}

/** Direct HTTP fetch with standard browser headers, SSRF-checked redirects, and per-session cookie forwarding. */
async function directFetch(
  initialUrl: URL,
  options: {
    cookies?: Map<string, string>;
    referer?: string;
    accept?: string;
    timeoutMs?: number;
  } = {},
): Promise<{ res: Response; finalUrl: URL }> {
  let url = initialUrl;
  const jar = options.cookies ?? new Map<string, string>();
  let res: Response | undefined;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const headers: Record<string, string> = {
      ...BROWSER_HEADERS,
      ...(options.accept ? { accept: options.accept } : {}),
      ...(options.referer ? { referer: options.referer, "sec-fetch-site": "same-origin" } : {}),
    };
    const ck = cookieHeader(jar);
    if (ck) headers.cookie = ck;

    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
      headers,
    });
    mergeCookies(jar, res);

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const rawLoc = res.headers.get("location")!;
      let next: URL;
      try {
        const resolved = new URL(rawLoc, url);
        if (resolved.protocol === "http:") resolved.protocol = "https:";
        next = assertSafeOutboundUrl(resolved.toString());
      } catch {
        throw new KnowledgeError("The page redirects somewhere that is not allowed.");
      }
      // Do not leak cookies across unrelated origins.
      if (registrableHost(next.hostname) !== registrableHost(url.hostname)) {
        jar.clear();
      }
      url = next;
      continue;
    }
    break;
  }

  if (!res) throw new KnowledgeError("The page could not be reached.");
  return { res, finalUrl: url };
}

async function fetchViaFirecrawl(url: string): Promise<ScrapedPage | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: false }),
      signal: AbortSignal.timeout(READER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: { markdown?: string; links?: string[]; metadata?: { title?: string; sourceURL?: string } };
    };
    const md = json?.data?.markdown?.trim();
    if (!md || md.length < 40) return null;
    const finalUrl = json.data?.metadata?.sourceURL || url;
    const rawLinks = Array.isArray(json.data?.links) ? json.data.links : [];
    const links = [
      ...new Set([
        ...rawLinks.map((l) => canonicalizeUrl(l)).filter((l): l is string => Boolean(l)),
        ...extractLinksFromMarkdown(md, finalUrl),
      ]),
    ];
    return {
      url: finalUrl,
      title: (json.data?.metadata?.title || new URL(finalUrl).hostname).trim(),
      text: md.slice(0, MAX_TEXT_CHARS),
      links,
      via: "firecrawl",
    };
  } catch {
    return null;
  }
}

async function fetchViaJina(url: string): Promise<ScrapedPage | null> {
  const apiKey = process.env.JINA_API_KEY?.trim();
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Return-Format": "markdown",
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(READER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { title?: string; url?: string; content?: string };
    };
    const text = json?.data?.content?.trim();
    if (!text || text.length < 40) return null;
    const finalUrl = json.data?.url || url;
    return {
      url: finalUrl,
      title: (json.data?.title || new URL(finalUrl).hostname).trim(),
      text: text.slice(0, MAX_TEXT_CHARS),
      links: extractLinksFromMarkdown(text, finalUrl),
      via: "jina",
    };
  } catch {
    return null;
  }
}

async function fetchViaTinyFish(url: string): Promise<ScrapedPage | null> {
  const apiKey = process.env.TINYFISH_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.fetch.tinyfish.ai", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: [url] }),
      signal: AbortSignal.timeout(READER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ url?: string; final_url?: string; title?: string; text?: string; description?: string }>;
    };
    const hit = json?.results?.[0];
    const text = (hit?.text || hit?.description || "").trim();
    if (!text || text.length < 40) return null;
    const finalUrl = hit?.final_url || hit?.url || url;
    return {
      url: finalUrl,
      title: (hit?.title || new URL(finalUrl).hostname).trim(),
      text: text.slice(0, MAX_TEXT_CHARS),
      links: extractLinksFromMarkdown(text, finalUrl),
      via: "tinyfish",
    };
  } catch {
    return null;
  }
}

const RETRYABLE_STATUSES = new Set([403, 406, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);

/**
 * Fetches one public URL cleanly:
 * 1. Direct HTTPS fetch with realistic browser headers & redirect cookie forwarding (fixes Akamai / NSE HTTP 520 & HTTP/2 stream resets).
 * 2. Origin homepage cookie warm-up retry if a subpage returns 403/520 or drops the stream.
 * 3. Configured reader API fallback (Firecrawl -> Jina Reader -> TinyFetch) if datacenter IP is rejected or page is an empty JS SPA shell.
 */
export async function fetchSinglePage(
  rawUrl: string,
  cookies?: Map<string, string>,
  onLog?: (e: ScrapeLogEvent) => void | Promise<void>,
): Promise<ScrapedPage> {
  const url = normalizePublicUrl(rawUrl);
  const jar = cookies ?? new Map<string, string>();
  let directError: string | null = null;
  let directStatus: number | null = null;
  let directResult: ScrapedPage | null = null;

  const tryDirect = async (via: "direct" | "direct-warmup", referer?: string): Promise<ScrapedPage | null> => {
    const { res, finalUrl } = await directFetch(url, { cookies: jar, referer });
    directStatus = res.status;
    if (!res.ok) {
      directError = `HTTP ${res.status}`;
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = await readBodyLimited(res, MAX_PAGE_BYTES);
    if (!bytes.length) {
      directError = "Empty response body";
      return null;
    }

    // If URL directly serves a document (PDF, CSV, DOCX, XLSX, JSON, XML, MD), parse it natively.
    const docKind = kindFromContentType(contentType);
    if (docKind && docKind !== "html") {
      const text = await extractFileText(docKind, bytes, finalUrl.pathname);
      return {
        url: finalUrl.toString(),
        title: decodeURIComponent(finalUrl.pathname.split("/").filter(Boolean).pop() || finalUrl.hostname),
        text: text.slice(0, MAX_TEXT_CHARS),
        links: [],
        via,
      };
    }

    if (!/text\/(html|plain)|application\/xhtml/i.test(contentType) && contentType !== "") {
      throw new KnowledgeError(`Unsupported content type (${contentType.split(";")[0]}).`);
    }

    const html = new TextDecoder("utf-8").decode(bytes);
    if (/text\/plain/i.test(contentType)) {
      return {
        url: finalUrl.toString(),
        title: finalUrl.hostname,
        text: html.slice(0, MAX_TEXT_CHARS),
        links: [],
        via,
      };
    }

    const { title, text } = htmlToText(html);
    const links = extractLinksFromHtml(html, finalUrl.toString());
    return {
      url: finalUrl.toString(),
      title: title || finalUrl.hostname,
      text: text.slice(0, MAX_TEXT_CHARS),
      links,
      via,
    };
  };

  try {
    directResult = await tryDirect("direct");
  } catch (e) {
    if (e instanceof KnowledgeError) throw e;
    directError = e instanceof Error ? e.message : "Network connection failed";
  }

  // If a subpage failed with Akamai/CDN status (403/520/stream error), warm up the origin root once to get session cookies.
  if (!directResult && (directStatus === null || RETRYABLE_STATUSES.has(directStatus))) {
    try {
      await onLog?.({
        level: "warn",
        stage: "fetch",
        message: `Direct fetch got ${directError ?? "error"}; warming up origin session and retrying...`,
        url: url.toString(),
      });
      if (url.pathname !== "/") {
        const rootUrl = new URL("/", url.origin);
        await directFetch(rootUrl, { cookies: jar, timeoutMs: 10_000 }).catch(() => undefined);
      } else {
        await new Promise((r) => setTimeout(r, 450));
      }
      directResult = await tryDirect("direct-warmup", `${url.origin}/`);
    } catch (e) {
      if (e instanceof KnowledgeError) throw e;
      directError = e instanceof Error ? e.message : directError;
    }
  }

  // If direct HTML succeeded with substantial readable content, return immediately!
  if (directResult && directResult.text.trim().length >= 120) {
    return directResult;
  }

  // Fallback to configured web readers if direct fetch was blocked (e.g. CF Workers edge IP -> Akamai 403/520) or JS-only SPA shell.
  const reason = directResult
    ? `Direct HTML only yielded ${directResult.text.trim().length} chars (likely client-rendered JS)`
    : `Direct fetch failed (${directError ?? "blocked"})`;

  await onLog?.({
    level: "info",
    stage: "fallback",
    message: `${reason}; trying managed web reader fallback...`,
    url: url.toString(),
  });

  const readers: Array<{ name: string; fn: (u: string) => Promise<ScrapedPage | null> }> = [
    { name: "Firecrawl", fn: fetchViaFirecrawl },
    { name: "Jina Reader", fn: fetchViaJina },
    { name: "TinyFish", fn: fetchViaTinyFish },
  ];

  for (const reader of readers) {
    const fallback = await reader.fn(url.toString());
    if (fallback && fallback.text.trim().length >= 40) {
      await onLog?.({
        level: "success",
        stage: "fallback",
        message: `Extracted ${fallback.text.length.toLocaleString()} chars via ${reader.name}.`,
        url: url.toString(),
      });
      return fallback;
    }
  }

  // If direct fetch got *some* text (even <120 chars), return it rather than failing completely.
  if (directResult && directResult.text.trim().length >= 20) {
    return directResult;
  }

  if (directStatus) {
    throw new KnowledgeError(`The page answered with an error (${directStatus}).`);
  }
  throw new KnowledgeError(`The page could not be reached (${directError ?? "network error"}).`);
}

/** Backwards-compatible helper for single-page text extraction. */
export async function fetchPageText(raw: string): Promise<{ title: string; text: string }> {
  const page = await fetchSinglePage(raw);
  return { title: page.title, text: page.text };
}

// ---------- Sitemap Discovery & Fetching ----------
async function fetchTextResource(url: URL, cookies: Map<string, string>): Promise<{ text: string; finalUrl: URL } | null> {
  try {
    const { res, finalUrl } = await directFetch(url, {
      cookies,
      accept: "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
      timeoutMs: 14_000,
    });
    if (!res.ok) return null;
    const raw = await readBodyLimited(res, MAX_SITEMAP_BYTES);
    if (!raw.length) return null;
    // Detect gzipped sitemap (.xml.gz magic bytes 1f 8b)
    const bytes = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
    return { text: new TextDecoder("utf-8").decode(bytes), finalUrl };
  } catch {
    return null;
  }
}

function matchesCrawlFilters(
  urlStr: string,
  allowedHosts: Set<string>,
  pathPrefix: string,
  excludePatterns: string[],
): boolean {
  let u: URL;
  try {
    u = assertSafeOutboundUrl(urlStr);
  } catch {
    return false;
  }
  if (!isSameSiteHost(u.hostname, allowedHosts)) return false;
  if (SKIP_EXTENSIONS.test(u.pathname)) return false;
  if (pathPrefix && pathPrefix !== "/") {
    const normPrefix = pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`;
    if (!u.pathname.toLowerCase().startsWith(normPrefix.toLowerCase())) return false;
  }
  const lower = u.toString().toLowerCase();
  for (const pat of excludePatterns) {
    if (pat && lower.includes(pat.toLowerCase())) return false;
  }
  return true;
}

async function discoverSitemapUrls(
  seed: URL,
  config: ScrapeConfig,
  cookies: Map<string, string>,
  callbacks?: ScrapeCallbacks,
): Promise<{ urls: string[]; allowedHosts: Set<string> }> {
  const maxPages = Math.min(MAX_PAGES_HARD_CAP, Math.max(1, config.maxPages ?? 15));
  const excludePatterns = (config.excludePatterns ?? []).map((p) => p.trim()).filter(Boolean);
  const explicitPrefix = (config.pathPrefix ?? "").trim();
  const allowedHosts = new Set<string>([registrableHost(seed.hostname)]);
  const sitemapQueue: string[] = [];
  const seenSitemaps = new Set<string>();
  const collected = new Set<string>();

  const looksLikeSitemap = /\.xml(?:\.gz)?$/i.test(seed.pathname) || /sitemap/i.test(seed.pathname);
  if (looksLikeSitemap) {
    sitemapQueue.push(seed.toString());
  } else {
    // 1. Check robots.txt for Sitemap directives
    const robotsUrl = new URL("/robots.txt", seed.origin);
    await callbacks?.onLog?.({ level: "info", stage: "sitemap", message: `Checking ${robotsUrl.toString()} for sitemap directives...`, url: robotsUrl.toString() });
    const robots = await fetchTextResource(robotsUrl, cookies);
    if (robots) {
      allowedHosts.add(registrableHost(robots.finalUrl.hostname));
      for (const line of robots.text.split(/\r?\n/)) {
        const m = /^\s*sitemap:\s*(\S+)/i.exec(line);
        if (m?.[1]) {
          try {
            const smUrl = normalizePublicUrl(m[1]);
            allowedHosts.add(registrableHost(smUrl.hostname));
            sitemapQueue.push(smUrl.toString());
          } catch {
            // ignore invalid sitemap URL
          }
        }
      }
      if (sitemapQueue.length) {
        await callbacks?.onLog?.({ level: "success", stage: "sitemap", message: `Found ${sitemapQueue.length} sitemap URL(s) in robots.txt.` });
      }
    }
    // 2. Also probe standard sitemap locations if robots.txt had none
    if (!sitemapQueue.length) {
      sitemapQueue.push(new URL("/sitemap.xml", seed.origin).toString());
      sitemapQueue.push(new URL("/sitemap_index.xml", seed.origin).toString());
    }
  }

  let parsedCount = 0;
  while (sitemapQueue.length > 0 && parsedCount < 10 && collected.size < maxPages * 3) {
    const smRaw = sitemapQueue.shift()!;
    if (seenSitemaps.has(smRaw)) continue;
    seenSitemaps.add(smRaw);

    let smUrl: URL;
    try {
      smUrl = normalizePublicUrl(smRaw);
    } catch {
      continue;
    }

    await callbacks?.onLog?.({ level: "info", stage: "sitemap", message: `Fetching sitemap: ${smUrl.toString()}`, url: smUrl.toString() });
    const res = await fetchTextResource(smUrl, cookies);
    if (!res) {
      await callbacks?.onLog?.({ level: "warn", stage: "sitemap", message: `Sitemap unavailable at ${smUrl.toString()}`, url: smUrl.toString() });
      continue;
    }
    allowedHosts.add(registrableHost(res.finalUrl.hostname));
    parsedCount++;

    const { urls, childSitemaps } = parseSitemapXml(res.text);
    if (childSitemaps.length) {
      await callbacks?.onLog?.({
        level: "info",
        stage: "sitemap",
        message: `Sitemap index contains ${childSitemaps.length} nested sitemap(s).`,
        url: smUrl.toString(),
      });
      for (const child of childSitemaps.slice(0, 12)) {
        if (!seenSitemaps.has(child)) sitemapQueue.push(child);
      }
    }
    if (urls.length) {
      let added = 0;
      for (const rawEntry of urls) {
        try {
          const norm = normalizePublicUrl(rawEntry);
          allowedHosts.add(registrableHost(norm.hostname));
          const canon = canonicalizeUrl(norm.toString());
          if (!canon) continue;
          if (!matchesCrawlFilters(canon, allowedHosts, explicitPrefix, excludePatterns)) continue;
          if (!collected.has(canon)) {
            collected.add(canon);
            added++;
          }
        } catch {
          // ignore invalid entry
        }
        if (collected.size >= maxPages * 4) break;
      }
      await callbacks?.onLog?.({
        level: "success",
        stage: "sitemap",
        message: `Parsed ${urls.length} URL(s) from sitemap (${added} matched filters).`,
        url: smUrl.toString(),
      });
    }
  }

  // Fallback to Firecrawl /v1/map when no XML sitemap was found
  if (!collected.size && process.env.FIRECRAWL_API_KEY?.trim()) {
    await callbacks?.onLog?.({ level: "info", stage: "sitemap", message: "No XML sitemap found; discovering site links via Firecrawl Map..." });
    try {
      const mapRes = await fetch("https://api.firecrawl.dev/v1/map", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: seed.toString(), limit: maxPages }),
        signal: AbortSignal.timeout(20_000),
      });
      if (mapRes.ok) {
        const json = (await mapRes.json()) as { links?: string[] };
        for (const l of json.links ?? []) {
          const canon = canonicalizeUrl(l);
          if (canon && matchesCrawlFilters(canon, allowedHosts, explicitPrefix, excludePatterns)) {
            collected.add(canon);
          }
        }
        if (collected.size) {
          await callbacks?.onLog?.({ level: "success", stage: "sitemap", message: `Firecrawl Map discovered ${collected.size} page(s).` });
        }
      }
    } catch {
      // ignore map fallback failure
    }
  }

  // Prioritize the seed URL first if it's a normal web page (not .xml) and matches filters.
  const list = [...collected];
  if (!looksLikeSitemap) {
    const seedCanon = canonicalizeUrl(seed.toString());
    if (seedCanon && !collected.has(seedCanon)) {
      list.unshift(seedCanon);
    }
  }

  return { urls: list.slice(0, maxPages), allowedHosts };
}

// ---------- Main Orchestrator: Single / Sitemap / Subpages ----------
export async function scrapeWebsite(
  rawUrl: string,
  mode: ScrapeMode,
  config: ScrapeConfig = {},
  callbacks?: ScrapeCallbacks,
): Promise<ScrapeWebsiteResult> {
  const seed = normalizePublicUrl(rawUrl);
  const cookies = new Map<string, string>();
  const maxPages = Math.min(MAX_PAGES_HARD_CAP, Math.max(1, config.maxPages ?? (mode === "single" ? 1 : 15)));
  const maxDepth = Math.min(3, Math.max(1, config.maxDepth ?? 2));
  const excludePatterns = (config.excludePatterns ?? []).map((p) => p.trim()).filter(Boolean);

  // ---- Mode 1: Single Page ----
  if (mode === "single") {
    await callbacks?.onProgress?.({ stage: "scraping", pagesTotal: 1, pagesScraped: 0, pagesFailed: 0 });
    await callbacks?.onLog?.({ level: "info", stage: "fetch", message: `Fetching page ${seed.toString()}...`, url: seed.toString() });
    const page = await fetchSinglePage(seed.toString(), cookies, callbacks?.onLog);
    await callbacks?.onProgress?.({ stage: "scraping", pagesTotal: 1, pagesScraped: 1, pagesFailed: 0 });
    await callbacks?.onLog?.({
      level: "success",
      stage: "fetch",
      message: `Scraped "${page.title}" (${page.text.length.toLocaleString()} chars via ${page.via}).`,
      url: page.url,
    });
    return { title: page.title, pages: [page], totalDiscovered: 1, failedCount: 0 };
  }

  // ---- Mode 2: Sitemap ----
  if (mode === "sitemap") {
    await callbacks?.onProgress?.({ stage: "discovering", pagesTotal: 0, pagesScraped: 0, pagesFailed: 0 });
    const { urls } = await discoverSitemapUrls(seed, config, cookies, callbacks);

    if (!urls.length) {
      await callbacks?.onLog?.({
        level: "warn",
        stage: "sitemap",
        message: "No sitemap URLs matched; falling back to subpage discovery from the starting page.",
        url: seed.toString(),
      });
      return scrapeWebsite(rawUrl, "subpages", { ...config, maxPages, maxDepth: 1 }, callbacks);
    }

    await callbacks?.onLog?.({
      level: "info",
      stage: "scrape",
      message: `Starting sitemap scrape of ${urls.length} page(s)...`,
    });
    await callbacks?.onProgress?.({ stage: "scraping", pagesTotal: urls.length, pagesScraped: 0, pagesFailed: 0 });

    const pages: ScrapedPage[] = [];
    let failedCount = 0;
    let totalChars = 0;

    for (let i = 0; i < urls.length; i++) {
      const target = urls[i]!;
      await callbacks?.onLog?.({
        level: "info",
        stage: "scrape",
        message: `[${i + 1}/${urls.length}] Scraping ${target}`,
        url: target,
      });
      try {
        const page = await fetchSinglePage(target, cookies, callbacks?.onLog);
        const trimmed = page.text.slice(0, PER_PAGE_TEXT_CAP);
        pages.push({ ...page, text: trimmed });
        totalChars += trimmed.length;
        await callbacks?.onLog?.({
          level: "success",
          stage: "scrape",
          message: `[${i + 1}/${urls.length}] OK: "${page.title}" (${trimmed.length.toLocaleString()} chars via ${page.via})`,
          url: page.url,
        });
      } catch (e) {
        failedCount++;
        const msg = e instanceof Error ? e.message : "Failed to fetch page";
        await callbacks?.onLog?.({
          level: "warn",
          stage: "scrape",
          message: `[${i + 1}/${urls.length}] Skipped: ${msg}`,
          url: target,
        });
      }
      await callbacks?.onProgress?.({
        stage: "scraping",
        pagesTotal: urls.length,
        pagesScraped: pages.length,
        pagesFailed: failedCount,
      });
      if (totalChars >= MAX_TEXT_CHARS) {
        await callbacks?.onLog?.({
          level: "warn",
          stage: "scrape",
          message: `Reached ${(MAX_TEXT_CHARS / 1000).toFixed(0)}k character content cap; proceeding to indexing with ${pages.length} page(s).`,
        });
        break;
      }
    }

    if (!pages.length) {
      throw new KnowledgeError("None of the sitemap pages could be scraped.");
    }
    const baseTitle = `${seed.hostname} (Sitemap · ${pages.length} ${pages.length === 1 ? "page" : "pages"})`;
    return { title: baseTitle, pages, totalDiscovered: urls.length, failedCount };
  }

  // ---- Mode 3: Subpages BFS Crawl ----
  const seedCanon = canonicalizeUrl(seed.toString()) ?? seed.toString();
  const explicitPrefix = (config.pathPrefix ?? "").trim();
  const defaultPrefix =
    config.samePathPrefix && seed.pathname !== "/"
      ? seed.pathname.replace(/\/+$/, "")
      : "";
  const effectivePrefix = explicitPrefix || defaultPrefix;

  const allowedHosts = new Set<string>([registrableHost(seed.hostname)]);
  const visited = new Set<string>([seedCanon]);
  const queue: Array<{ url: string; depth: number }> = [{ url: seedCanon, depth: 0 }];
  const pages: ScrapedPage[] = [];
  let failedCount = 0;
  let totalChars = 0;

  await callbacks?.onLog?.({
    level: "info",
    stage: "crawl",
    message: `Starting subpages crawl from ${seedCanon} (max ${maxPages} pages, depth ${maxDepth}${effectivePrefix ? `, path "${effectivePrefix}"` : ""}).`,
    url: seedCanon,
  });
  await callbacks?.onProgress?.({ stage: "scraping", pagesTotal: 1, pagesScraped: 0, pagesFailed: 0 });

  while (queue.length > 0 && pages.length + failedCount < maxPages) {
    const current = queue.shift()!;
    const plannedTotal = Math.min(maxPages, pages.length + failedCount + queue.length + 1);
    await callbacks?.onLog?.({
      level: "info",
      stage: "crawl",
      message: `[Depth ${current.depth} · ${pages.length + failedCount + 1}/${plannedTotal}] Scraping ${current.url}`,
      url: current.url,
    });

    try {
      const page = await fetchSinglePage(current.url, cookies, callbacks?.onLog);
      // Track redirect host (e.g. nseindia.com -> nseindia.in) as an allowed same-site host.
      try {
        allowedHosts.add(registrableHost(new URL(page.url).hostname));
      } catch {
        // ignore
      }
      const canonFinal = canonicalizeUrl(page.url);
      if (canonFinal) visited.add(canonFinal);

      const trimmed = page.text.slice(0, PER_PAGE_TEXT_CAP);
      pages.push({ ...page, text: trimmed });
      totalChars += trimmed.length;

      let queuedNow = 0;
      if (current.depth < maxDepth) {
        for (const link of page.links) {
          if (visited.has(link)) continue;
          if (!matchesCrawlFilters(link, allowedHosts, effectivePrefix, excludePatterns)) continue;
          if (visited.size >= maxPages * 3) break;
          visited.add(link);
          queue.push({ url: link, depth: current.depth + 1 });
          queuedNow++;
        }
      }

      await callbacks?.onLog?.({
        level: "success",
        stage: "crawl",
        message: `OK: "${page.title}" (${trimmed.length.toLocaleString()} chars via ${page.via}${queuedNow > 0 ? `, +${queuedNow} subpage(s) queued` : ""})`,
        url: page.url,
      });
    } catch (e) {
      failedCount++;
      const msg = e instanceof Error ? e.message : "Failed to fetch page";
      await callbacks?.onLog?.({
        level: "warn",
        stage: "crawl",
        message: `Skipped ${current.url}: ${msg}`,
        url: current.url,
      });
    }

    const updatedTotal = Math.min(maxPages, pages.length + failedCount + queue.length);
    await callbacks?.onProgress?.({
      stage: "scraping",
      pagesTotal: Math.max(pages.length + failedCount, updatedTotal),
      pagesScraped: pages.length,
      pagesFailed: failedCount,
    });

    if (totalChars >= MAX_TEXT_CHARS) {
      await callbacks?.onLog?.({
        level: "warn",
        stage: "crawl",
        message: `Reached ${(MAX_TEXT_CHARS / 1000).toFixed(0)}k character content cap; proceeding to indexing with ${pages.length} page(s).`,
      });
      break;
    }
  }

  if (!pages.length) {
    throw new KnowledgeError("Could not scrape any content from this website.");
  }

  const firstTitle = pages[0]!.title;
  const finalTitle =
    pages.length === 1
      ? firstTitle
      : `${firstTitle.slice(0, 180)} (+${pages.length - 1} ${pages.length - 1 === 1 ? "subpage" : "subpages"})`;
  return {
    title: finalTitle,
    pages,
    totalDiscovered: Math.min(maxPages, visited.size),
    failedCount,
  };
}

import "server-only";
import {
  SEARCH_PROVIDER_SLUGS,
  type SearchProviderChoice,
  type SearchProviderDto,
  type WebImageResult,
  type WebSearchBundle,
  type WebSearchResult,
  type WebVideoResult,
} from "@backend/server/ai/web-search-types";
import { logEvent } from "@backend/server/logger";
import { loadSearchProvidersFromDb } from "@backend/server/services/search-providers";
import { assertSafeOutboundUrl } from "@backend/server/workflow-engine/ssrf";

const UA = "Mozilla/5.0 (compatible; RelayNestBot/1.0; +https://relaynest.app)";
const SOURCE_TIMEOUT_MS = 4_500;
const KEYED_PROVIDER_TIMEOUT_MS = 7_500;
const PAGE_FETCH_TIMEOUT_MS = 3_800;

const XML_ENTITIES: Record<string, string> = {
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
};

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return XML_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripTags(s: string): string {
  return decodeXmlEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSnippet(s: string | undefined | null, maxLen = 700): string {
  const clean = (s ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 3).trimEnd()}...`;
}

function safePublicUrl(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  try {
    return assertSafeOutboundUrl(trimmed).toString();
  } catch {
    return null;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function formatDuration(seconds: number | undefined): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Parses an optional provider prefix in search commands, e.g.
 * `"tinyfish: latest AI agents"` -> `{ provider: "tinyfish", query: "latest AI agents" }`.
 */
export function parseSearchProviderPrefix(raw: string): { provider: SearchProviderChoice; query: string } {
  const trimmed = raw.trim();
  const m = /^([a-z0-9_-]{2,20})\s*:\s*([\s\S]+)$/i.exec(trimmed);
  if (m) {
    const slug = m[1]!.toLowerCase();
    if ((SEARCH_PROVIDER_SLUGS as readonly string[]).includes(slug)) {
      return { provider: slug as SearchProviderChoice, query: m[2]!.trim() };
    }
  }
  return { provider: "auto", query: trimmed };
}

/** Extracts items from an RSS 2.0 XML feed cleanly without external XML dependencies. */
export function parseRssItems(xml: string): Array<{ title: string; url: string; snippet: string; publishedAt?: string }> {
  const out: Array<{ title: string; url: string; snippet: string; publishedAt?: string }> = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]!;
    const tag = (name: string) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(block)?.[1] ?? "";
    const title = stripTags(tag("title"));
    let rawLink = stripTags(tag("link"));
    // Bing News RSS wraps target links in a `url=` query parameter on bing.com/news/apiclick.aspx.
    if (/bing\.com\/news\/apiclick/i.test(rawLink)) {
      try {
        const inner = new URL(rawLink).searchParams.get("url");
        if (inner) rawLink = inner;
      } catch {
        // keep rawLink
      }
    }
    const url = safePublicUrl(rawLink);
    if (!title || !url) continue;
    const snippet = stripTags(tag("description"));
    const rawDate = stripTags(tag("pubDate"));
    let publishedAt: string | undefined;
    if (rawDate) {
      const parsed = Date.parse(rawDate);
      if (!Number.isNaN(parsed)) publishedAt = new Date(parsed).toISOString().slice(0, 10);
    }
    out.push({ title, url, snippet, publishedAt });
  }
  return out;
}

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const shorts = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1];
      if (shorts) return shorts;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchJson<T>(
  url: string,
  init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { "user-agent": UA, accept: "application/json", ...init.headers },
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: AbortSignal.timeout(init.timeoutMs ?? SOURCE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchText(url: string, headers: Record<string, string> = {}, timeoutMs = SOURCE_TIMEOUT_MS): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, text/html", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Strips non-visual intent words (specs, review, price, vs, guide...) so image archives match actual subjects cleanly. */
export function extractVisualQuery(q: string): string {
  const cleaned = q
    .replace(
      /\b(specs?|specifications?|reviews?|pricing|prices?|cost|compare|comparison|vs\.?|versus|latest|news|today|updates?|how\s+to|guide|tutorial|explained|what\s+is|who\s+is|best|top|pros\s+and\s+cons|features?|details?|info|information|and|for|with|about|in|of|the)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned : q.trim();
}

// =============================================================================
// 1. TinyFish (TinySearch GET + TinyFetch POST Markdown Enrichment)
// =============================================================================

export interface TinyFishSearchItem {
  position?: number;
  site_name?: string;
  title?: string;
  snippet?: string;
  url?: string;
  published_date?: string;
}

/** Pure parser for TinyFish TinySearch + optional TinyFetch responses (exported for unit tests). */
export function normalizeTinyFishResults(
  searchJson: { results?: TinyFishSearchItem[] } | null,
  fetchedPages: Map<string, string>,
  maxResults: number,
): WebSearchResult[] {
  const out: WebSearchResult[] = [];
  for (const r of searchJson?.results ?? []) {
    const url = safePublicUrl(r.url);
    if (!url || !r.title) continue;
    const enrichedText = fetchedPages.get(url);
    const snippet = enrichedText
      ? cleanSnippet(`${r.snippet ? `${r.snippet} — ` : ""}${enrichedText}`, 850)
      : cleanSnippet(r.snippet || r.title, 450);
    out.push({
      index: out.length + 1,
      title: r.title.trim(),
      url,
      domain: r.site_name?.replace(/^www\./i, "") || domainOf(url),
      snippet,
      publishedAt: r.published_date?.slice(0, 10),
      source: "TinyFish",
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

async function searchTinyFish(
  provider: SearchProviderDto,
  query: string,
  maxResults: number,
): Promise<{ engine: string; results: WebSearchResult[]; images: WebImageResult[]; videos: WebVideoResult[]; answerSummary?: string } | null> {
  const apiKey = provider.envKeyName ? process.env[provider.envKeyName]?.trim() : "";
  if (!apiKey) return null;

  const base = provider.baseUrl || "https://api.search.tinyfish.ai";
  const params = new URLSearchParams({
    query,
    purpose: `Provide thorough, factual, up-to-date details and structured specs for: ${query}`,
    language: "en",
  });
  const searchJson = await fetchJson<{ results?: TinyFishSearchItem[] }>(`${base}?${params.toString()}`, {
    headers: { "X-API-Key": apiKey },
    timeoutMs: KEYED_PROVIDER_TIMEOUT_MS,
  });

  const rawUrls = (searchJson?.results ?? [])
    .map((r) => safePublicUrl(r.url))
    .filter((u): u is string => Boolean(u))
    .slice(0, 2);

  if (!rawUrls.length) return null;

  // Enrich top 2 results via TinyFetch (POST https://api.fetch.tinyfish.ai) for deep Markdown context.
  const fetchedPages = new Map<string, string>();
  if (provider.fetchUrl && rawUrls.length > 0) {
    const fetchJsonRes = await fetchJson<{
      results?: Array<{ url?: string; final_url?: string; text?: string; description?: string }>;
    }>(provider.fetchUrl, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: rawUrls }),
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
    });
    for (const p of fetchJsonRes?.results ?? []) {
      const target = safePublicUrl(p.url) ?? safePublicUrl(p.final_url);
      const body = (p.text || p.description || "").replace(/^#+\s*/gm, "").trim();
      if (target && body.length > 40) {
        fetchedPages.set(target, cleanSnippet(body, 750));
      }
    }
  }

  const results = normalizeTinyFishResults(searchJson, fetchedPages, maxResults);
  if (!results.length) return null;
  return {
    engine: fetchedPages.size > 0 ? "TinyFish (TinySearch + TinyFetch)" : "TinyFish (TinySearch)",
    results,
    images: [],
    videos: [],
  };
}

// =============================================================================
// 2. SearXNG (100% Open-Source Self-Hosted Metasearch)
// =============================================================================

async function searchSearxng(
  provider: SearchProviderDto,
  query: string,
  maxResults: number,
  maxImages: number,
  maxVideos: number,
): Promise<{ engine: string; results: WebSearchResult[]; images: WebImageResult[]; videos: WebVideoResult[]; answerSummary?: string } | null> {
  const configuredUrl = provider.envKeyName ? process.env[provider.envKeyName]?.trim() : "";
  if (!configuredUrl) return null;

  let origin: string;
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    origin = parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }

  const q = encodeURIComponent(query);
  const [webJson, imgJson, vidJson] = await Promise.all([
    fetchJson<{ results?: Array<{ title?: string; url?: string; content?: string; publishedDate?: string; engine?: string }> }>(
      `${origin}/search?q=${q}&format=json&categories=general`,
      { timeoutMs: KEYED_PROVIDER_TIMEOUT_MS },
    ),
    fetchJson<{ results?: Array<{ title?: string; img_src?: string; thumbnail_src?: string; url?: string; engine?: string }> }>(
      `${origin}/search?q=${q}&format=json&categories=images`,
      { timeoutMs: KEYED_PROVIDER_TIMEOUT_MS },
    ),
    fetchJson<{ results?: Array<{ title?: string; url?: string; thumbnail?: string; author?: string; length?: string; engine?: string }> }>(
      `${origin}/search?q=${q}&format=json&categories=videos`,
      { timeoutMs: KEYED_PROVIDER_TIMEOUT_MS },
    ),
  ]);

  const results: WebSearchResult[] = [];
  for (const r of webJson?.results ?? []) {
    const url = safePublicUrl(r.url);
    if (!url || !r.title) continue;
    results.push({
      index: results.length + 1,
      title: r.title.trim(),
      url,
      domain: domainOf(url),
      snippet: cleanSnippet(r.content || r.title, 500),
      publishedAt: r.publishedDate?.slice(0, 10),
      source: r.engine || "SearXNG",
    });
    if (results.length >= maxResults) break;
  }

  const images: WebImageResult[] = [];
  for (const im of imgJson?.results ?? []) {
    const imageUrl = safePublicUrl(im.img_src);
    const thumbnailUrl = safePublicUrl(im.thumbnail_src) ?? imageUrl;
    const sourceUrl = safePublicUrl(im.url) ?? imageUrl;
    if (!imageUrl || !thumbnailUrl || !sourceUrl) continue;
    images.push({
      title: (im.title ?? query).trim().slice(0, 140),
      imageUrl,
      thumbnailUrl,
      sourceUrl,
      source: im.engine || "SearXNG",
    });
    if (images.length >= maxImages) break;
  }

  const videos: WebVideoResult[] = [];
  for (const v of vidJson?.results ?? []) {
    const url = safePublicUrl(v.url);
    if (!url || !v.title) continue;
    const ytId = extractYouTubeId(url);
    videos.push({
      title: v.title.trim().slice(0, 160),
      url,
      thumbnailUrl: safePublicUrl(v.thumbnail) ?? (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined),
      channel: v.author,
      duration: v.length,
      source: ytId ? "YouTube" : (v.engine || "SearXNG"),
    });
    if (videos.length >= maxVideos) break;
  }

  if (!results.length && !images.length && !videos.length) return null;
  return { engine: "SearXNG (Open Source)", results, images, videos };
}

// =============================================================================
// 3. Firecrawl Search (Open-Core Search + Markdown Scraping)
// =============================================================================

async function searchFirecrawl(
  provider: SearchProviderDto,
  query: string,
  maxResults: number,
): Promise<{ engine: string; results: WebSearchResult[]; images: WebImageResult[]; videos: WebVideoResult[]; answerSummary?: string } | null> {
  const apiKey = provider.envKeyName ? process.env[provider.envKeyName]?.trim() : "";
  if (!apiKey) return null;

  const json = await fetchJson<{
    success?: boolean;
    data?: Array<{ url?: string; title?: string; description?: string; markdown?: string }>;
  }>(provider.baseUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: maxResults, scrapeOptions: { formats: ["markdown"] } }),
    timeoutMs: KEYED_PROVIDER_TIMEOUT_MS,
  });

  const results: WebSearchResult[] = [];
  for (const r of json?.data ?? []) {
    const url = safePublicUrl(r.url);
    if (!url) continue;
    const title = (r.title || domainOf(url)).trim();
    const text = r.markdown ? r.markdown.replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/\s+/g, " ").trim() : r.description;
    results.push({
      index: results.length + 1,
      title,
      url,
      domain: domainOf(url),
      snippet: cleanSnippet(text || title, 800),
      source: "Firecrawl",
    });
    if (results.length >= maxResults) break;
  }

  if (!results.length) return null;
  return { engine: "Firecrawl Search (Open Core)", results, images: [], videos: [] };
}

// =============================================================================
// 4. Jina Search & Reader (s.jina.ai JSON API)
// =============================================================================

async function searchJina(
  provider: SearchProviderDto,
  query: string,
  maxResults: number,
): Promise<{ engine: string; results: WebSearchResult[]; images: WebImageResult[]; videos: WebVideoResult[]; answerSummary?: string } | null> {
  const apiKey = provider.envKeyName ? process.env[provider.envKeyName]?.trim() : "";
  if (!apiKey) return null;

  const json = await fetchJson<{
    data?: Array<{ title?: string; url?: string; description?: string; content?: string; date?: string }>;
  }>(`${provider.baseUrl}/${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    timeoutMs: KEYED_PROVIDER_TIMEOUT_MS,
  });

  const results: WebSearchResult[] = [];
  for (const r of json?.data ?? []) {
    const url = safePublicUrl(r.url);
    if (!url || !r.title) continue;
    results.push({
      index: results.length + 1,
      title: r.title.trim(),
      url,
      domain: domainOf(url),
      snippet: cleanSnippet(r.content || r.description || r.title, 800),
      publishedAt: r.date?.slice(0, 10),
      source: "Jina",
    });
    if (results.length >= maxResults) break;
  }

  if (!results.length) return null;
  return { engine: "Jina Search & Reader", results, images: [], videos: [] };
}

// =============================================================================
// 5. Tavily AI Search
// =============================================================================

async function searchTavily(
  provider: SearchProviderDto,
  query: string,
  maxResults: number,
  maxImages: number,
): Promise<{ engine: string; results: WebSearchResult[]; images: WebImageResult[]; videos: WebVideoResult[]; answerSummary?: string } | null> {
  const apiKey = provider.envKeyName ? process.env[provider.envKeyName]?.trim() : "";
  if (!apiKey) return null;

  const json = await fetchJson<{
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
    images?: Array<string | { url?: string; description?: string }>;
  }>(provider.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: true,
      include_images: true,
    }),
    timeoutMs: KEYED_PROVIDER_TIMEOUT_MS,
  });

  const results: WebSearchResult[] = [];
  for (const r of json?.results ?? []) {
    const url = safePublicUrl(r.url);
    if (!url || !r.title) continue;
    results.push({
      index: results.length + 1,
      title: r.title.trim(),
      url,
      domain: domainOf(url),
      snippet: cleanSnippet(r.content || r.title, 700),
      publishedAt: r.published_date?.slice(0, 10),
      source: "Tavily",
    });
    if (results.length >= maxResults) break;
  }

  const images: WebImageResult[] = [];
  for (const im of json?.images ?? []) {
    const rawUrl = typeof im === "string" ? im : im.url;
    const safeImg = safePublicUrl(rawUrl);
    if (!safeImg) continue;
    images.push({
      title: (typeof im === "string" ? query : im.description || query).slice(0, 140),
      imageUrl: safeImg,
      thumbnailUrl: safeImg,
      sourceUrl: safeImg,
      source: "Tavily",
    });
    if (images.length >= maxImages) break;
  }

  if (!results.length) return null;
  return { engine: "Tavily AI Search", answerSummary: json?.answer || undefined, results, images, videos: [] };
}

// =============================================================================
// 6. Brave Search API
// =============================================================================

async function searchBrave(
  provider: SearchProviderDto,
  query: string,
  maxResults: number,
  maxVideos: number,
): Promise<{ engine: string; results: WebSearchResult[]; images: WebImageResult[]; videos: WebVideoResult[]; answerSummary?: string } | null> {
  const apiKey = provider.envKeyName ? process.env[provider.envKeyName]?.trim() : "";
  if (!apiKey) return null;

  const json = await fetchJson<{
    web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> };
    videos?: { results?: Array<{ title?: string; url?: string; thumbnail?: { src?: string }; video?: { duration?: string; creator?: string } }> };
  }>(`${provider.baseUrl}?q=${encodeURIComponent(query)}&count=${maxResults}`, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
    timeoutMs: KEYED_PROVIDER_TIMEOUT_MS,
  });

  const results: WebSearchResult[] = [];
  for (const r of json?.web?.results ?? []) {
    const url = safePublicUrl(r.url);
    if (!url || !r.title) continue;
    results.push({
      index: results.length + 1,
      title: r.title.trim(),
      url,
      domain: domainOf(url),
      snippet: cleanSnippet(r.description || r.title, 500),
      source: "Brave",
    });
    if (results.length >= maxResults) break;
  }

  const videos: WebVideoResult[] = [];
  for (const v of json?.videos?.results ?? []) {
    const url = safePublicUrl(v.url);
    if (!url || !v.title) continue;
    const ytId = extractYouTubeId(url);
    videos.push({
      title: v.title.trim().slice(0, 160),
      url,
      thumbnailUrl: safePublicUrl(v.thumbnail?.src) ?? (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined),
      channel: v.video?.creator,
      duration: v.video?.duration,
      source: ytId ? "YouTube" : "Brave",
    });
    if (videos.length >= maxVideos) break;
  }

  if (!results.length) return null;
  return { engine: "Brave Search", results, images: [], videos };
}

// =============================================================================
// 7. Built-in Zero-Key Open Multi-Source Web, Images & Videos Aggregator
// =============================================================================

async function searchBingWebRss(query: string): Promise<Array<{ title: string; url: string; snippet: string; publishedAt?: string; source: string }>> {
  const xml = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`);
  if (!xml) return [];
  return parseRssItems(xml).map((it) => ({ ...it, source: "Web" }));
}

async function searchBingNewsRss(query: string): Promise<Array<{ title: string; url: string; snippet: string; publishedAt?: string; source: string }>> {
  const xml = await fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`);
  if (!xml) return [];
  return parseRssItems(xml).slice(0, 4).map((it) => ({ ...it, source: "News" }));
}

async function searchDuckDuckGoInstant(query: string): Promise<{
  summary?: string;
  results: Array<{ title: string; url: string; snippet: string; source: string }>;
  image?: WebImageResult;
}> {
  const data = await fetchJson<{
    Heading?: string;
    Abstract?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    Image?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  }>(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
  if (!data) return { results: [] };

  const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
  const absUrl = safePublicUrl(data.AbstractURL);
  if (data.Abstract && absUrl) {
    results.push({
      title: data.Heading || data.AbstractSource || query,
      url: absUrl,
      snippet: data.Abstract,
      source: data.AbstractSource || "DuckDuckGo",
    });
  }
  for (const t of (data.RelatedTopics ?? []).slice(0, 3)) {
    const u = safePublicUrl(t.FirstURL);
    if (t.Text && u) {
      results.push({
        title: t.Text.split(" - ")[0]?.slice(0, 120) || query,
        url: u,
        snippet: t.Text,
        source: "DuckDuckGo",
      });
    }
  }

  let image: WebImageResult | undefined;
  const rawImg = data.Image ? (data.Image.startsWith("http") ? data.Image : `https://duckduckgo.com${data.Image}`) : null;
  const safeImg = safePublicUrl(rawImg);
  if (safeImg && absUrl) {
    image = {
      title: data.Heading || query,
      imageUrl: safeImg,
      thumbnailUrl: safeImg,
      sourceUrl: absUrl,
      source: data.AbstractSource || "DuckDuckGo",
    };
  }

  return { summary: data.Abstract || undefined, results, image };
}

async function searchWikipedia(query: string): Promise<{
  summary?: string;
  results: Array<{ title: string; url: string; snippet: string; source: string }>;
  images: WebImageResult[];
}> {
  const search = await fetchJson<{ query?: { search?: Array<{ title: string; snippet?: string }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
  );
  const hits = search?.query?.search ?? [];
  if (!hits.length) return { results: [], images: [] };

  const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
  const images: WebImageResult[] = [];

  const topTitle = hits[0]!.title;
  const summaryData = await fetchJson<{
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
    thumbnail?: { source?: string; width?: number; height?: number };
    originalimage?: { source?: string; width?: number; height?: number };
  }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle.replace(/ /g, "_"))}`);

  let summary: string | undefined;
  if (summaryData?.extract) {
    summary = summaryData.extract;
    const pageUrl = safePublicUrl(summaryData.content_urls?.desktop?.page) ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(topTitle.replace(/ /g, "_"))}`;
    results.push({
      title: `${summaryData.title ?? topTitle} — Wikipedia`,
      url: pageUrl,
      snippet: summaryData.extract,
      source: "Wikipedia",
    });
    const thumb = safePublicUrl(summaryData.thumbnail?.source);
    const orig = safePublicUrl(summaryData.originalimage?.source);
    const bestImg = orig && !/\.svg(\?|$)/i.test(orig) ? orig : thumb;
    if (bestImg && thumb) {
      images.push({
        title: summaryData.title ?? topTitle,
        imageUrl: bestImg,
        thumbnailUrl: thumb,
        sourceUrl: pageUrl,
        source: "Wikipedia",
        width: summaryData.thumbnail?.width,
        height: summaryData.thumbnail?.height,
      });
    }
  }

  for (const h of hits.slice(summary ? 1 : 0)) {
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`;
    results.push({
      title: `${h.title} — Wikipedia`,
      url,
      snippet: stripTags(h.snippet ?? ""),
      source: "Wikipedia",
    });
  }

  return { summary, results, images };
}

async function searchWikimediaImages(query: string): Promise<WebImageResult[]> {
  const data = await fetchJson<{
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          imageinfo?: Array<{
            url?: string;
            thumburl?: string;
            descriptionurl?: string;
            mime?: string;
            width?: number;
            height?: number;
            thumbwidth?: number;
            thumbheight?: number;
          }>;
        }
      >;
    };
  }>(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=960&format=json&origin=*`,
  );

  const pages = Object.values(data?.query?.pages ?? {});
  const out: WebImageResult[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const mime = (info.mime ?? "").toLowerCase();
    if (!mime.startsWith("image/") || mime.includes("tiff") || mime.includes("djvu")) continue;
    const thumb = safePublicUrl(info.thumburl);
    const full = safePublicUrl(info.url);
    const imageUrl = mime.includes("svg") ? thumb : (thumb ?? full);
    const thumbnailUrl = thumb ?? imageUrl;
    const sourceUrl = safePublicUrl(info.descriptionurl) ?? full ?? imageUrl;
    if (!imageUrl || !thumbnailUrl || !sourceUrl) continue;
    if ((info.width ?? 400) < 200 || (info.height ?? 400) < 160) continue;
    const cleanTitle = (p.title ?? query).replace(/^File:/i, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").trim();
    out.push({
      title: cleanTitle.slice(0, 140),
      imageUrl,
      thumbnailUrl,
      sourceUrl,
      source: "Wikimedia Commons",
      width: info.thumbwidth ?? info.width,
      height: info.thumbheight ?? info.height,
    });
    if (out.length >= 4) break;
  }
  return out;
}

async function searchOpenverseImages(query: string): Promise<WebImageResult[]> {
  const data = await fetchJson<{
    results?: Array<{
      title?: string;
      url?: string;
      thumbnail?: string;
      foreign_landing_url?: string;
      source?: string;
      width?: number;
      height?: number;
    }>;
  }>(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=5`);

  const out: WebImageResult[] = [];
  for (const r of data?.results ?? []) {
    const imageUrl = safePublicUrl(r.url);
    const thumbnailUrl = safePublicUrl(r.thumbnail) ?? imageUrl;
    const sourceUrl = safePublicUrl(r.foreign_landing_url) ?? imageUrl;
    if (!imageUrl || !thumbnailUrl || !sourceUrl) continue;
    if ((r.width ?? 400) < 220 || (r.height ?? 400) < 160) continue;
    out.push({
      title: (r.title ?? query).trim().slice(0, 140),
      imageUrl,
      thumbnailUrl,
      sourceUrl,
      source: r.source ? `Openverse · ${r.source}` : "Openverse",
      width: r.width,
      height: r.height,
    });
    if (out.length >= 4) break;
  }
  return out;
}

async function searchDailymotionVideos(query: string): Promise<WebVideoResult[]> {
  const data = await fetchJson<{
    list?: Array<{
      id?: string;
      title?: string;
      url?: string;
      thumbnail_480_url?: string;
      duration?: number;
      "owner.screenname"?: string;
    }>;
  }>(
    `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,url,thumbnail_480_url,duration,owner.screenname&limit=4`,
  );

  const out: WebVideoResult[] = [];
  for (const v of data?.list ?? []) {
    const url = safePublicUrl(v.url);
    if (!url || !v.title) continue;
    out.push({
      title: v.title.trim().slice(0, 160),
      url,
      thumbnailUrl: safePublicUrl(v.thumbnail_480_url) ?? undefined,
      channel: v["owner.screenname"]?.trim() || undefined,
      duration: formatDuration(v.duration),
      source: "Dailymotion",
    });
  }
  return out;
}

async function searchYouTubeViaRss(query: string): Promise<WebVideoResult[]> {
  const xml = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(`${query} youtube video`)}&format=rss`);
  if (!xml) return [];
  const items = parseRssItems(xml);
  const out: WebVideoResult[] = [];
  for (const it of items) {
    const id = extractYouTubeId(it.url);
    if (!id) continue;
    out.push({
      title: it.title.replace(/\s*[-|]\s*YouTube$/i, "").trim().slice(0, 160),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      source: "YouTube",
    });
    if (out.length >= 4) break;
  }
  return out;
}

async function searchGitHubRepos(query: string): Promise<Array<{ title: string; url: string; snippet: string; source: string }>> {
  const data = await fetchJson<{
    items?: Array<{ full_name?: string; html_url?: string; description?: string; stargazers_count?: number; language?: string }>;
  }>(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=3`, {
    headers: { accept: "application/vnd.github+json" },
  });
  const out: Array<{ title: string; url: string; snippet: string; source: string }> = [];
  for (const repo of data?.items ?? []) {
    const url = safePublicUrl(repo.html_url);
    if (!url || !repo.full_name) continue;
    const stars = typeof repo.stargazers_count === "number" ? `★ ${repo.stargazers_count.toLocaleString("en-US")}` : "";
    const meta = [repo.language, stars].filter(Boolean).join(" · ");
    out.push({
      title: `${repo.full_name} (GitHub)`,
      url,
      snippet: `${repo.description ?? "Open-source repository on GitHub."}${meta ? ` [${meta}]` : ""}`,
      source: "GitHub",
    });
  }
  return out;
}

function isTechOrCodeQuery(q: string): boolean {
  return /\b(github|open[\s-]?source|repo|library|framework|sdk|api|npm|pip|python|typescript|javascript|react|next\.?js|rust|docker|kubernetes|linux|sql|postgres|cloudflare|llm|model)\b/i.test(q);
}

function isNewsQuery(q: string): boolean {
  return /\b(latest|news|today|recent|update|updates|release|announced|2025|2026|price|stock|score|match|weather|election)\b/i.test(q);
}

function dedupeImages(list: WebImageResult[], max: number): WebImageResult[] {
  const seen = new Set<string>();
  const out: WebImageResult[] = [];
  for (const im of list) {
    if (out.length >= max) break;
    const key = im.imageUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(im);
  }
  return out;
}

function dedupeVideos(list: WebVideoResult[], max: number): WebVideoResult[] {
  const seen = new Set<string>();
  const out: WebVideoResult[] = [];
  for (const v of list) {
    if (out.length >= max) break;
    const key = v.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Fetches open-source images (Wikimedia Commons + Openverse) and videos (YouTube + Dailymotion) in parallel. */
async function fetchOpenMediaEnrichment(
  query: string,
  visualQuery: string,
  needImages: boolean,
  needVideos: boolean,
): Promise<{ images: WebImageResult[]; videos: WebVideoResult[] }> {
  const [commonsImgs, openverseImgs, ytVideos, dmVideos] = await Promise.all([
    needImages ? searchWikimediaImages(visualQuery) : Promise.resolve([]),
    needImages ? searchOpenverseImages(visualQuery) : Promise.resolve([]),
    needVideos ? searchYouTubeViaRss(query) : Promise.resolve([]),
    needVideos ? searchDailymotionVideos(query) : Promise.resolve([]),
  ]);
  return {
    images: [...commonsImgs, ...openverseImgs],
    videos: [...ytVideos, ...dmVideos],
  };
}

async function runBuiltInOpenWeb(
  query: string,
  visualQuery: string,
  maxResults: number,
  maxImages: number,
  maxVideos: number,
): Promise<WebSearchBundle> {
  const [webRss, newsRss, ddg, wiki, commonsImgs, openverseImgs, ytVideos, dmVideos, ghRepos] = await Promise.all([
    searchBingWebRss(query),
    isNewsQuery(query) ? searchBingNewsRss(query) : Promise.resolve([]),
    searchDuckDuckGoInstant(visualQuery),
    searchWikipedia(visualQuery),
    searchWikimediaImages(visualQuery),
    searchOpenverseImages(visualQuery),
    searchYouTubeViaRss(query),
    searchDailymotionVideos(query),
    isTechOrCodeQuery(query) ? searchGitHubRepos(query) : Promise.resolve([]),
  ]);

  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const mergedWeb: WebSearchResult[] = [];

  const pushWeb = (item: { title: string; url: string; snippet: string; publishedAt?: string; source?: string }) => {
    if (mergedWeb.length >= maxResults) return;
    const canonical = item.url.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 50);
    if (seenUrls.has(canonical) || (titleKey && seenTitles.has(titleKey))) return;
    seenUrls.add(canonical);
    if (titleKey) seenTitles.add(titleKey);
    mergedWeb.push({
      index: mergedWeb.length + 1,
      title: item.title,
      url: item.url,
      domain: domainOf(item.url),
      snippet: item.snippet || item.title,
      publishedAt: item.publishedAt,
      source: item.source,
    });
  };

  for (const r of webRss.slice(0, 3)) pushWeb(r);
  for (const r of newsRss.slice(0, 2)) pushWeb(r);
  for (const r of wiki.results.slice(0, 2)) pushWeb(r);
  for (const r of ghRepos.slice(0, 2)) pushWeb(r);
  for (const r of ddg.results.slice(0, 2)) pushWeb(r);
  for (const r of webRss.slice(3)) pushWeb(r);

  const images = dedupeImages([...wiki.images, ...commonsImgs, ...openverseImgs, ...(ddg.image ? [ddg.image] : [])], maxImages);
  const videos = dedupeVideos([...ytVideos, ...dmVideos], maxVideos);

  const activeSources = new Set<string>();
  if (webRss.length || newsRss.length) activeSources.add("Web");
  if (wiki.results.length || commonsImgs.length) activeSources.add("Wikipedia/Commons");
  if (openverseImgs.length) activeSources.add("Openverse");
  if (ytVideos.length || dmVideos.length) activeSources.add("Videos");
  if (ghRepos.length) activeSources.add("GitHub");

  return {
    query,
    engine: activeSources.size ? `Open Web (${[...activeSources].join(" + ")})` : "Open Web Search",
    providerSlug: "open-web",
    answerSummary: ddg.summary || wiki.summary,
    results: mergedWeb,
    images,
    videos,
    searchedAt: new Date().toISOString(),
  };
}

async function runKeyedProvider(
  provider: SearchProviderDto,
  query: string,
  maxResults: number,
  maxImages: number,
  maxVideos: number,
) {
  switch (provider.slug) {
    case "tinyfish":
      return searchTinyFish(provider, query, maxResults);
    case "searxng":
      return searchSearxng(provider, query, maxResults, maxImages, maxVideos);
    case "firecrawl":
      return searchFirecrawl(provider, query, maxResults);
    case "jina":
      return searchJina(provider, query, maxResults);
    case "tavily":
      return searchTavily(provider, query, maxResults, maxImages);
    case "brave":
      return searchBrave(provider, query, maxResults, maxVideos);
    default:
      return null;
  }
}

/**
 * Multi-provider live web search backed by Supabase `public.search_providers`:
 * supports TinyFish (TinySearch + TinyFetch), self-hosted SearXNG, Firecrawl, Jina Search & Reader,
 * Tavily, Brave Search, and built-in zero-key Open Multi-Source Web Search — always enriching with
 * open-source image previews and videos when a text-only search provider is active.
 */
export async function searchOpenWeb(
  rawQuery: string,
  opts: {
    provider?: SearchProviderChoice;
    maxResults?: number;
    maxImages?: number;
    maxVideos?: number;
  } = {},
): Promise<WebSearchBundle> {
  const query = rawQuery.trim().slice(0, 300);
  const maxResults = opts.maxResults ?? 6;
  const maxImages = opts.maxImages ?? 4;
  const maxVideos = opts.maxVideos ?? 4;
  const requested = opts.provider ?? "auto";

  if (!query) {
    return {
      query: "",
      engine: "Open Web Search",
      providerSlug: "open-web",
      results: [],
      images: [],
      videos: [],
      searchedAt: new Date().toISOString(),
    };
  }

  const providers = await loadSearchProvidersFromDb();
  const visualQuery = extractVisualQuery(query);

  // Build ordered candidate list of configured keyed providers (skipping open-web, which is always the reliable fallback).
  const keyedCandidates =
    requested === "open-web"
      ? []
      : requested === "auto"
        ? providers.filter((p) => p.slug !== "open-web" && p.configured)
        : providers.filter((p) => p.slug === requested && p.configured);

  // Start open visual/video enrichment concurrently ONLY when a keyed provider lacks native images/videos.
  const firstKeyed = keyedCandidates[0];
  const mediaPromise =
    firstKeyed && (!firstKeyed.supportsImages || !firstKeyed.supportsVideos)
      ? fetchOpenMediaEnrichment(query, visualQuery, !firstKeyed.supportsImages, !firstKeyed.supportsVideos)
      : null;

  for (const candidate of keyedCandidates) {
    try {
      const res = await runKeyedProvider(candidate, query, maxResults, maxImages, maxVideos);
      if (res && (res.results.length > 0 || res.images.length > 0 || res.videos.length > 0)) {
        const extraMedia = mediaPromise
          ? await mediaPromise
          : res.images.length === 0 || res.videos.length === 0
            ? await fetchOpenMediaEnrichment(query, visualQuery, res.images.length === 0, res.videos.length === 0)
            : { images: [], videos: [] };

        const images = dedupeImages([...res.images, ...extraMedia.images], maxImages);
        const videos = dedupeVideos([...res.videos, ...extraMedia.videos], maxVideos);
        const mediaNote =
          extraMedia.images.length || extraMedia.videos.length
            ? " + Open Media"
            : "";

        return {
          query,
          engine: `${res.engine}${mediaNote}`,
          providerSlug: candidate.slug,
          answerSummary: res.answerSummary,
          results: res.results,
          images,
          videos,
          searchedAt: new Date().toISOString(),
        };
      }
    } catch (e) {
      logEvent("backend", "warn", `Search provider ${candidate.slug} failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return runBuiltInOpenWeb(query, visualQuery, maxResults, maxImages, maxVideos);
}

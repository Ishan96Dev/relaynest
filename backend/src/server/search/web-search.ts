import "server-only";
import type { WebImageResult, WebSearchBundle, WebSearchResult, WebVideoResult } from "@backend/server/ai/web-search-types";
import { assertSafeOutboundUrl } from "@backend/server/workflow-engine/ssrf";

const UA = "Mozilla/5.0 (compatible; RelayNestBot/1.0; +https://relaynest.app)";
const SOURCE_TIMEOUT_MS = 4_500;

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

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json", ...headers },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, text/html", ...headers },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Optional self-hosted open-source SearXNG instance when SEARXNG_URL is configured in .env. */
async function searchSearxng(baseUrl: string, query: string, maxResults: number): Promise<WebSearchBundle | null> {
  let origin: string;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    origin = parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }

  const q = encodeURIComponent(query);
  const [webJson, imgJson, vidJson] = await Promise.all([
    fetchJson<{ results?: Array<{ title?: string; url?: string; content?: string; publishedDate?: string; engine?: string }> }>(`${origin}/search?q=${q}&format=json&categories=general`),
    fetchJson<{ results?: Array<{ title?: string; img_src?: string; thumbnail_src?: string; url?: string; engine?: string }> }>(`${origin}/search?q=${q}&format=json&categories=images`),
    fetchJson<{ results?: Array<{ title?: string; url?: string; thumbnail?: string; author?: string; length?: string; engine?: string }> }>(`${origin}/search?q=${q}&format=json&categories=videos`),
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
      snippet: (r.content ?? "").trim(),
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
    if (images.length >= 6) break;
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
      source: ytId ? "YouTube" : (v.engine || "Video"),
    });
    if (videos.length >= 5) break;
  }

  if (!results.length && !images.length && !videos.length) return null;
  return {
    query,
    engine: "SearXNG (Open Source)",
    results,
    images,
    videos,
    searchedAt: new Date().toISOString(),
  };
}

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

  // Enrich the top Wikipedia match with its rich REST summary + thumbnail.
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
    // Skip audio/video/PDF files and raw vector files lacking raster thumbnails.
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
    accept: "application/vnd.github+json",
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

/** Strips non-visual intent words (specs, review, price, vs, guide...) so image archives match actual subjects cleanly. */
export function extractVisualQuery(q: string): string {
  const cleaned = q
    .replace(/\b(specs?|specifications?|reviews?|pricing|prices?|cost|compare|comparison|vs\.?|versus|latest|news|today|updates?|how\s+to|guide|tutorial|explained|what\s+is|who\s+is|best|top|pros\s+and\s+cons|features?|details?|info|information|and|for|with|about|in|of|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned : q.trim();
}

/**
 * Performs live open-source multi-source web search returning structured web articles,
 * visual images, and videos — with optional self-hosted SearXNG (`SEARXNG_URL`) support
 * and zero paid API keys required.
 */
export async function searchOpenWeb(
  rawQuery: string,
  opts: { maxResults?: number; maxImages?: number; maxVideos?: number } = {},
): Promise<WebSearchBundle> {
  const query = rawQuery.trim().slice(0, 300);
  const maxResults = opts.maxResults ?? 6;
  const maxImages = opts.maxImages ?? 4;
  const maxVideos = opts.maxVideos ?? 4;

  if (!query) {
    return { query: "", engine: "Open Web Search", results: [], images: [], videos: [], searchedAt: new Date().toISOString() };
  }

  // 1. Prefer self-hosted open-source SearXNG when configured in environment.
  const searxUrl = process.env.SEARXNG_URL?.trim();
  if (searxUrl) {
    const searx = await searchSearxng(searxUrl, query, maxResults);
    if (searx) {
      return {
        ...searx,
        images: searx.images.slice(0, maxImages),
        videos: searx.videos.slice(0, maxVideos),
      };
    }
  }

  // 2. Built-in open multi-source search fan-out in parallel (~400ms–1.5s total).
  const visualQuery = extractVisualQuery(query);
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

  // Merge and deduplicate web results while balancing direct web hits, Wikipedia, News, and GitHub.
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

  // Interleave top results so answers have both authoritative overview & fresh web sources.
  for (const r of webRss.slice(0, 3)) pushWeb(r);
  for (const r of newsRss.slice(0, 2)) pushWeb(r);
  for (const r of wiki.results.slice(0, 2)) pushWeb(r);
  for (const r of ghRepos.slice(0, 2)) pushWeb(r);
  for (const r of ddg.results.slice(0, 2)) pushWeb(r);
  for (const r of webRss.slice(3)) pushWeb(r);

  // Merge and deduplicate images (Wikipedia summary photo -> Wikimedia Commons -> Openverse -> DDG).
  const seenImg = new Set<string>();
  const images: WebImageResult[] = [];
  for (const im of [...wiki.images, ...commonsImgs, ...openverseImgs, ...(ddg.image ? [ddg.image] : [])]) {
    if (images.length >= maxImages) break;
    const key = im.imageUrl.toLowerCase();
    if (seenImg.has(key)) continue;
    seenImg.add(key);
    images.push(im);
  }

  // Merge and deduplicate videos (YouTube first, then Dailymotion).
  const seenVid = new Set<string>();
  const videos: WebVideoResult[] = [];
  for (const v of [...ytVideos, ...dmVideos]) {
    if (videos.length >= maxVideos) break;
    const key = v.url.toLowerCase();
    if (seenVid.has(key)) continue;
    seenVid.add(key);
    videos.push(v);
  }

  const activeSources = new Set<string>();
  if (webRss.length || newsRss.length) activeSources.add("Web");
  if (wiki.results.length || commonsImgs.length) activeSources.add("Wikipedia/Commons");
  if (openverseImgs.length) activeSources.add("Openverse");
  if (ytVideos.length || dmVideos.length) activeSources.add("Videos");
  if (ghRepos.length) activeSources.add("GitHub");

  return {
    query,
    engine: activeSources.size ? `Open Web (${[...activeSources].join(" + ")})` : "Open Web Search",
    answerSummary: ddg.summary || wiki.summary,
    results: mergedWeb,
    images,
    videos,
    searchedAt: new Date().toISOString(),
  };
}

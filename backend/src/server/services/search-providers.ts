import "server-only";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { createAdminClient } from "@backend/lib/supabase/admin";
import type { SearchProviderDto, SearchProviderSlug } from "@backend/server/ai/web-search-types";

type Row = Record<string, unknown>;

const COLUMNS =
  "slug, name, kind, base_url, fetch_url, env_key_name, is_open_source, requires_key, supports_images, supports_videos, supports_page_fetch, docs_url, description, is_active, priority";

/** Static seed fallback used only when Supabase is not configured (demo mode). */
export const DEFAULT_SEARCH_PROVIDERS: Omit<SearchProviderDto, "configured">[] = [
  {
    slug: "tinyfish",
    name: "TinyFish (TinySearch + TinyFetch)",
    kind: "agent_search",
    baseUrl: "https://api.search.tinyfish.ai",
    fetchUrl: "https://api.fetch.tinyfish.ai",
    envKeyName: "TINYFISH_API_KEY",
    isOpenSource: false,
    requiresKey: true,
    supportsImages: false,
    supportsVideos: false,
    supportsPageFetch: true,
    docsUrl: "https://docs.tinyfish.ai",
    description: "AI-agent web search & Markdown page extraction (TinySearch + TinyFetch) paired with open image/video enrichment.",
    isActive: true,
    priority: 10,
  },
  {
    slug: "searxng",
    name: "SearXNG (Self-Hosted Open Source)",
    kind: "metasearch",
    baseUrl: "http://localhost:8080",
    fetchUrl: null,
    envKeyName: "SEARXNG_URL",
    isOpenSource: true,
    requiresKey: true,
    supportsImages: true,
    supportsVideos: true,
    supportsPageFetch: false,
    docsUrl: "https://docs.searxng.org",
    description: "100% open-source (AGPL-3.0) privacy-respecting metasearch engine aggregating web, images, and videos.",
    isActive: true,
    priority: 20,
  },
  {
    slug: "firecrawl",
    name: "Firecrawl Search (Open Core)",
    kind: "crawl_search",
    baseUrl: "https://api.firecrawl.dev/v1/search",
    fetchUrl: null,
    envKeyName: "FIRECRAWL_API_KEY",
    isOpenSource: true,
    requiresKey: true,
    supportsImages: false,
    supportsVideos: false,
    supportsPageFetch: true,
    docsUrl: "https://docs.firecrawl.dev",
    description: "Open-source/cloud search + full-page Markdown extraction built for LLM agents.",
    isActive: true,
    priority: 30,
  },
  {
    slug: "jina",
    name: "Jina Search & Reader",
    kind: "crawl_search",
    baseUrl: "https://s.jina.ai",
    fetchUrl: "https://r.jina.ai",
    envKeyName: "JINA_API_KEY",
    isOpenSource: true,
    requiresKey: true,
    supportsImages: false,
    supportsVideos: false,
    supportsPageFetch: true,
    docsUrl: "https://jina.ai/reader",
    description: "Structured LLM-ready web search (s.jina.ai) and clean page-to-Markdown extraction (r.jina.ai).",
    isActive: true,
    priority: 40,
  },
  {
    slug: "tavily",
    name: "Tavily AI Search",
    kind: "agent_search",
    baseUrl: "https://api.tavily.com/search",
    fetchUrl: null,
    envKeyName: "TAVILY_API_KEY",
    isOpenSource: false,
    requiresKey: true,
    supportsImages: true,
    supportsVideos: false,
    supportsPageFetch: true,
    docsUrl: "https://docs.tavily.com",
    description: "AI-native search API returning synthesized answers, ranked sources, and image previews.",
    isActive: true,
    priority: 50,
  },
  {
    slug: "brave",
    name: "Brave Search API",
    kind: "agent_search",
    baseUrl: "https://api.search.brave.com/res/v1/web/search",
    fetchUrl: null,
    envKeyName: "BRAVE_SEARCH_API_KEY",
    isOpenSource: false,
    requiresKey: true,
    supportsImages: true,
    supportsVideos: true,
    supportsPageFetch: false,
    docsUrl: "https://brave.com/search/api/",
    description: "Independent search index with web, news, image, and video results.",
    isActive: true,
    priority: 60,
  },
  {
    slug: "open-web",
    name: "Open Multi-Source Web (Zero-Key)",
    kind: "open_aggregate",
    baseUrl: "https://www.bing.com/search",
    fetchUrl: null,
    envKeyName: null,
    isOpenSource: true,
    requiresKey: false,
    supportsImages: true,
    supportsVideos: true,
    supportsPageFetch: false,
    docsUrl: "https://commons.wikimedia.org",
    description: "Built-in zero-key open aggregator combining Web/News RSS, DuckDuckGo Instant, Wikipedia, Wikimedia Commons, Openverse CC images, GitHub, and Dailymotion/YouTube videos.",
    isActive: true,
    priority: 100,
  },
];

function isConfigured(envKeyName: string | null, requiresKey: boolean): boolean {
  if (!requiresKey || !envKeyName) return true;
  return Boolean(process.env[envKeyName]?.trim());
}

function toDto(r: Row): SearchProviderDto {
  const envKeyName = (r.env_key_name as string | null) ?? null;
  const requiresKey = r.requires_key === undefined ? true : Boolean(r.requires_key);
  return {
    slug: r.slug as SearchProviderSlug,
    name: String(r.name),
    kind: r.kind as SearchProviderDto["kind"],
    baseUrl: String(r.base_url).replace(/\/+$/, ""),
    fetchUrl: r.fetch_url ? String(r.fetch_url).replace(/\/+$/, "") : null,
    envKeyName,
    isOpenSource: Boolean(r.is_open_source),
    requiresKey,
    configured: isConfigured(envKeyName, requiresKey),
    supportsImages: Boolean(r.supports_images),
    supportsVideos: Boolean(r.supports_videos),
    supportsPageFetch: Boolean(r.supports_page_fetch),
    docsUrl: (r.docs_url as string | null) ?? null,
    description: String(r.description ?? ""),
    isActive: r.is_active === undefined ? true : Boolean(r.is_active),
    priority: Number(r.priority ?? 100),
  };
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; rows: Omit<SearchProviderDto, "configured">[] } | null = null;

export function clearSearchProvidersCache() {
  cache = null;
}

/** Loads active web search providers from Supabase `public.search_providers`, ordered by priority, annotated with live env readiness. */
export async function loadSearchProvidersFromDb(): Promise<SearchProviderDto[]> {
  let baseRows: Omit<SearchProviderDto, "configured">[] | null = null;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    baseRows = cache.rows;
  } else if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createAdminClient()
        .from("search_providers")
        .select(COLUMNS)
        .eq("is_active", true)
        .order("priority", { ascending: true });
      if (!error && data?.length) {
        baseRows = data.map((r) => {
          const d = toDto(r as Row);
          const { configured: _c, ...rest } = d;
          void _c;
          return rest;
        });
        cache = { at: Date.now(), rows: baseRows };
      }
    } catch {
      // fall through to demo catalog
    }
  }
  const rows = baseRows ?? DEFAULT_SEARCH_PROVIDERS;
  return rows.map((r) => ({ ...r, configured: isConfigured(r.envKeyName, r.requiresKey) }));
}

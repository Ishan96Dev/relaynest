-- Store web search provider endpoints, env key names, capabilities, and routing priority in Supabase DB.

create table if not exists public.search_providers (
  slug text primary key check (slug ~ '^[a-z0-9_-]{2,40}$'),
  name text not null,
  kind text not null check (kind in ('agent_search', 'metasearch', 'crawl_search', 'open_aggregate')),
  base_url text not null,
  fetch_url text,
  env_key_name text,
  is_open_source boolean not null default false,
  requires_key boolean not null default true,
  supports_images boolean not null default false,
  supports_videos boolean not null default false,
  supports_page_fetch boolean not null default false,
  docs_url text,
  description text not null,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists search_providers_updated on public.search_providers;
create trigger search_providers_updated before update on public.search_providers
  for each row execute function public.set_updated_at();

create index if not exists search_providers_active_priority_idx
  on public.search_providers (is_active, priority);

alter table public.search_providers enable row level security;
drop policy if exists "search providers readable" on public.search_providers;
create policy "search providers readable" on public.search_providers for select to authenticated using (true);
revoke all on public.search_providers from anon, authenticated;
grant select on public.search_providers to authenticated;

insert into public.search_providers (
  slug, name, kind, base_url, fetch_url, env_key_name, is_open_source, requires_key,
  supports_images, supports_videos, supports_page_fetch, docs_url, description, is_active, priority
) values
  (
    'tinyfish', 'TinyFish (TinySearch + TinyFetch)', 'agent_search',
    'https://api.search.tinyfish.ai', 'https://api.fetch.tinyfish.ai', 'TINYFISH_API_KEY',
    false, true, false, false, true,
    'https://docs.tinyfish.ai',
    'AI-agent web search & Markdown page extraction (TinySearch + TinyFetch) paired with open image/video enrichment.',
    true, 10
  ),
  (
    'searxng', 'SearXNG (Self-Hosted Open Source)', 'metasearch',
    'http://localhost:8080', null, 'SEARXNG_URL',
    true, true, true, true, false,
    'https://docs.searxng.org',
    '100% open-source (AGPL-3.0) privacy-respecting metasearch engine aggregating web, images, and videos.',
    true, 20
  ),
  (
    'firecrawl', 'Firecrawl Search (Open Core)', 'crawl_search',
    'https://api.firecrawl.dev/v1/search', null, 'FIRECRAWL_API_KEY',
    true, true, false, false, true,
    'https://docs.firecrawl.dev',
    'Open-source/cloud search + full-page Markdown extraction built for LLM agents.',
    true, 30
  ),
  (
    'jina', 'Jina Search & Reader', 'crawl_search',
    'https://s.jina.ai', 'https://r.jina.ai', 'JINA_API_KEY',
    true, true, false, false, true,
    'https://jina.ai/reader',
    'Structured LLM-ready web search (s.jina.ai) and clean page-to-Markdown extraction (r.jina.ai).',
    true, 40
  ),
  (
    'tavily', 'Tavily AI Search', 'agent_search',
    'https://api.tavily.com/search', null, 'TAVILY_API_KEY',
    false, true, true, false, true,
    'https://docs.tavily.com',
    'AI-native search API returning synthesized answers, ranked sources, and image previews.',
    true, 50
  ),
  (
    'brave', 'Brave Search API', 'agent_search',
    'https://api.search.brave.com/res/v1/web/search', null, 'BRAVE_SEARCH_API_KEY',
    false, true, true, true, false,
    'https://brave.com/search/api/',
    'Independent search index with web, news, image, and video results.',
    true, 60
  ),
  (
    'open-web', 'Open Multi-Source Web (Zero-Key)', 'open_aggregate',
    'https://www.bing.com/search', null, null,
    true, false, true, true, false,
    'https://commons.wikimedia.org',
    'Built-in zero-key open aggregator combining Web/News RSS, DuckDuckGo Instant, Wikipedia, Wikimedia Commons, Openverse CC images, GitHub, and Dailymotion/YouTube videos.',
    true, 100
  )
on conflict (slug) do update set
  name = excluded.name,
  kind = excluded.kind,
  base_url = excluded.base_url,
  fetch_url = excluded.fetch_url,
  env_key_name = excluded.env_key_name,
  is_open_source = excluded.is_open_source,
  requires_key = excluded.requires_key,
  supports_images = excluded.supports_images,
  supports_videos = excluded.supports_videos,
  supports_page_fetch = excluded.supports_page_fetch,
  docs_url = excluded.docs_url,
  description = excluded.description,
  is_active = excluded.is_active,
  priority = excluded.priority;

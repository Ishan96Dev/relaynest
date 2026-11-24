-- Knowledge Base (RAG): collections, documents, text chunks and the links that share a collection with bots.
-- Chunk text lives here. Embeddings live in the Milvus vector database (see docs/KNOWLEDGE_BASE.md); when Milvus is
-- not configured, retrieval falls back to the full-text index on kb_chunks.

-- ---------- collections ----------
create table if not exists public.kb_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  tone text not null default 'primary' check (tone in ('primary', 'info', 'success', 'amber')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists kb_collections_name_idx on public.kb_collections (workspace_id, lower(name));

-- ---------- documents ----------
create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  collection_id uuid not null references public.kb_collections(id) on delete cascade,
  kind text not null check (kind in ('pdf', 'txt', 'md', 'url')),
  name text not null check (char_length(name) between 1 and 300),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  storage_path text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'indexed', 'failed')),
  error text check (error is null or char_length(error) <= 500),
  chunk_count integer not null default 0,
  vector_indexed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  indexed_at timestamptz
);
create index if not exists kb_documents_collection_idx on public.kb_documents (collection_id, created_at desc);
create index if not exists kb_documents_workspace_idx on public.kb_documents (workspace_id, created_at desc);

-- ---------- chunks (id is also the Milvus primary key) ----------
create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  collection_id uuid not null references public.kb_collections(id) on delete cascade,
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  position integer not null,
  content text not null check (char_length(content) between 1 and 4000),
  fts tsvector generated always as (to_tsvector('simple', content)) stored
);
create index if not exists kb_chunks_document_idx on public.kb_chunks (document_id, position);
create index if not exists kb_chunks_collection_idx on public.kb_chunks (collection_id);
create index if not exists kb_chunks_fts_idx on public.kb_chunks using gin (fts);

-- ---------- sharing a collection with bots (rule-based bots, AI bots and AI agent bots are all rows in bots) ----------
create table if not exists public.kb_bot_links (
  collection_id uuid not null references public.kb_collections(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, bot_id)
);
create index if not exists kb_bot_links_bot_idx on public.kb_bot_links (bot_id);

-- ---------- row level security ----------
alter table public.kb_collections enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;
alter table public.kb_bot_links enable row level security;

create policy "members read" on public.kb_collections for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins insert" on public.kb_collections for insert to authenticated with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
create policy "admins update" on public.kb_collections for update to authenticated
  using (public.is_workspace_member(workspace_id, array['owner', 'admin']))
  with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
create policy "admins delete" on public.kb_collections for delete to authenticated using (public.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "members read" on public.kb_documents for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read" on public.kb_chunks for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "members read" on public.kb_bot_links for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins insert" on public.kb_bot_links for insert to authenticated with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
create policy "admins delete" on public.kb_bot_links for delete to authenticated using (public.is_workspace_member(workspace_id, array['owner', 'admin']));

revoke all on public.kb_collections, public.kb_documents, public.kb_chunks, public.kb_bot_links from anon, authenticated;
grant select, insert, update, delete on public.kb_collections to authenticated;
grant select on public.kb_documents, public.kb_chunks to authenticated;
grant select, insert, delete on public.kb_bot_links to authenticated;
-- Documents and chunks are written by the server (service role) after it checks the caller's role.

-- ---------- keyword retrieval (used when no vector database is configured, or as a fallback) ----------
-- p_tsquery is a pre-built 'word | word' expression made only of letters and digits by the server.
create or replace function public.kb_keyword_search(p_workspace uuid, p_collections uuid[], p_tsquery text, p_limit integer default 5)
returns table (id uuid, document_id uuid, collection_id uuid, content text, score real)
language sql stable
set search_path = public
as $$
  select c.id, c.document_id, c.collection_id, c.content, ts_rank(c.fts, q.tsq) as score
  from public.kb_chunks c, (select to_tsquery('simple', nullif(p_tsquery, '')) as tsq) q
  where c.workspace_id = p_workspace
    and c.collection_id = any (p_collections)
    and q.tsq is not null
    and c.fts @@ q.tsq
  order by score desc
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.kb_keyword_search(uuid, uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.kb_keyword_search(uuid, uuid[], text, integer) to service_role;

-- ---------- private bucket for the original files (access only through short-lived signed URLs) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge', 'knowledge', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- Expand Knowledge Base document formats (Excel, CSV, Word, PowerPoint, JSON/YAML/XML, HTML),
-- add sitemap & subpages crawl metadata, per-chunk source provenance, and persistent ingestion logs.

-- 1. Expand kb_documents.kind check constraint and add crawl / progress tracking columns
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.kb_documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.kb_documents drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.kb_documents
  add constraint kb_documents_kind_check
  check (kind in ('pdf', 'docx', 'xlsx', 'csv', 'pptx', 'txt', 'md', 'json', 'html', 'url'));

alter table public.kb_documents
  add column if not exists scrape_mode text not null default 'single'
    check (scrape_mode in ('single', 'sitemap', 'subpages')),
  add column if not exists scrape_config jsonb not null default '{}'::jsonb,
  add column if not exists progress_stage text,
  add column if not exists pages_total integer not null default 0 check (pages_total >= 0),
  add column if not exists pages_scraped integer not null default 0 check (pages_scraped >= 0),
  add column if not exists pages_failed integer not null default 0 check (pages_failed >= 0);

-- 2. Optional per-chunk source provenance (so multi-page sitemap/subpages citations point to the exact page)
alter table public.kb_chunks
  add column if not exists source_url text check (source_url is null or char_length(source_url) <= 2000),
  add column if not exists page_title text check (page_title is null or char_length(page_title) <= 300);

-- 3. Persistent ingestion & scraping logs (works across stateless Workers / serverless isolates)
create table if not exists public.kb_ingestion_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'success', 'warn', 'error')),
  stage text not null default 'init' check (char_length(stage) between 1 and 40),
  message text not null check (char_length(message) between 1 and 1000),
  url text check (url is null or char_length(url) <= 2000),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists kb_ingestion_logs_doc_idx on public.kb_ingestion_logs (document_id, created_at asc);
create index if not exists kb_ingestion_logs_workspace_idx on public.kb_ingestion_logs (workspace_id, created_at desc);

alter table public.kb_ingestion_logs enable row level security;

drop policy if exists "members read" on public.kb_ingestion_logs;
create policy "members read" on public.kb_ingestion_logs
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.kb_ingestion_logs from anon, authenticated;
grant select on public.kb_ingestion_logs to authenticated;

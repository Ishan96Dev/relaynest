-- Support explicit viewing, moving, and multi-collection assignment of Knowledge Base documents
-- across both Supabase (kb_collection_documents + kb_documents + kb_chunks + kb_keyword_search)
-- and Milvus vector DB synchronization.

create table if not exists public.kb_collection_documents (
  collection_id uuid not null references public.kb_collections(id) on delete cascade,
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (collection_id, document_id)
);

create index if not exists kb_collection_documents_doc_idx
  on public.kb_collection_documents (document_id);
create index if not exists kb_collection_documents_ws_col_idx
  on public.kb_collection_documents (workspace_id, collection_id);

alter table public.kb_collection_documents enable row level security;

drop policy if exists "members read" on public.kb_collection_documents;
create policy "members read" on public.kb_collection_documents
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.kb_collection_documents from anon, authenticated;
grant select on public.kb_collection_documents to authenticated;

-- Backfill all existing documents into kb_collection_documents
insert into public.kb_collection_documents (collection_id, document_id, workspace_id)
select collection_id, id, workspace_id
from public.kb_documents
where collection_id is not null
on conflict (collection_id, document_id) do nothing;

-- Update full-text keyword search so it honors both primary collection_id and kb_collection_documents assignments
create or replace function public.kb_keyword_search(p_workspace uuid, p_collections uuid[], p_tsquery text, p_limit integer default 5)
returns table (id uuid, document_id uuid, collection_id uuid, content text, score real)
language sql stable
set search_path = public
as $$
  select c.id, c.document_id, c.collection_id, c.content, ts_rank(c.fts, q.tsq) as score
  from public.kb_chunks c, (select to_tsquery('simple', nullif(p_tsquery, '')) as tsq) q
  where c.workspace_id = p_workspace
    and (
      c.collection_id = any (p_collections)
      or exists (
        select 1
        from public.kb_collection_documents cd
        where cd.document_id = c.document_id
          and cd.workspace_id = p_workspace
          and cd.collection_id = any (p_collections)
      )
    )
    and q.tsq is not null
    and c.fts @@ q.tsq
  order by score desc
  limit least(greatest(p_limit, 1), 20);
$$;

revoke all on function public.kb_keyword_search(uuid, uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.kb_keyword_search(uuid, uuid[], text, integer) to service_role;

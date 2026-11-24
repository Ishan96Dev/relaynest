"use client";
import {
  ArrowDownUp, BookOpen, CheckCircle2, Cloud, Download, Eye, FileText, Folder, Globe, LayoutGrid, Link2, List, Loader2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, XCircle,
} from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import type { CollectionDto, DocumentDto, KnowledgeStatusDto, LinkableBotDto } from "@backend/server/services/knowledge";
import { PageTitle } from "@/components/motion/split-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CollectionModal, LinkBotsModal, PreviewModal, UrlModal } from "./collection-modals";
import { formatBytes, formatDate, TYPE_LABEL } from "./format";
import { SearchCard } from "./search-card";

const typeCls: Record<string, string> = { PDF: "bg-danger/20 text-bad", TXT: "bg-info/25 text-sky", MD: "bg-primary/25 text-lavender", URL: "bg-foreground/10 text-foreground/80" };
const ACCEPT = { pdf: ".pdf,application/pdf", txt: ".txt,text/plain", md: ".md,.markdown,text/markdown" } as const;

function Status({ doc }: { doc: DocumentDto }) {
  const s = doc.status;
  if (s === "indexed") return <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Indexed</Badge>;
  if (s === "processing") return <Badge tone="info"><Loader2 className="size-3 animate-spin" aria-hidden />Processing</Badge>;
  if (s === "failed") return <Badge tone="danger"><XCircle className="size-3" aria-hidden />Failed</Badge>;
  return <Badge tone="neutral"><CheckCircle2 className="size-3" aria-hidden />Uploaded</Badge>;
}

interface Props { collections: CollectionDto[]; documents: DocumentDto[]; bots: LinkableBotDto[]; status: KnowledgeStatusDto; canWrite: boolean }

export function KnowledgeBase(props: Props) {
  const { bots, status, canWrite } = props;
  const [collections, setCollections] = React.useState(props.collections);
  const [docs, setDocs] = React.useState(props.documents);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [view, setView] = React.useState("collections");
  const [lower, setLower] = React.useState<"docs" | "bots">("docs");
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sort, setSort] = React.useState("updated");
  const [layout, setLayout] = React.useState<"grid" | "list">("grid");
  const [editing, setEditing] = React.useState<CollectionDto | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [sharing, setSharing] = React.useState<CollectionDto | null>(null);
  const [urlOpen, setUrlOpen] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [delDoc, setDelDoc] = React.useState<DocumentDto | null>(null);
  const [delCol, setDelCol] = React.useState<CollectionDto | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(0);
  const setNotice = (m: { tone: "ok" | "bad"; text: string } | null) => { if (m) toast[m.tone === "ok" ? "success" : "error"](m.text); };
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    const [c, d] = await Promise.all([api<CollectionDto[]>("/api/v1/knowledge/collections"), api<DocumentDto[]>("/api/v1/knowledge/documents")]);
    if (c.ok) setCollections(c.data);
    if (d.ok) setDocs(d.data);
  }, []);

  // While anything is being indexed, check again every few seconds.
  const pending = docs.some((d) => d.status === "processing");
  React.useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => void refresh(), 2500);
    return () => clearTimeout(t);
  }, [pending, docs, refresh]);

  const active = collections.find((c) => c.id === activeId) ?? null;
  const target = active ?? collections[0] ?? null;
  const botName = (id: string) => bots.find((b) => b.id === id);

  const sortedCollections = React.useMemo(() => [...collections].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt))), [collections, sort]);
  const shownDocs = React.useMemo(() => docs.filter((d) => {
    if (activeId && d.collectionId !== activeId) return false;
    if (view === "processing" && d.status === "indexed") return false;
    if (typeFilter !== "all" && d.kind !== typeFilter) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return !query.trim() || d.name.toLowerCase().includes(query.trim().toLowerCase());
  }), [docs, activeId, view, typeFilter, statusFilter, query]);

  function pick(kind: keyof typeof ACCEPT) {
    if (!canWrite) return setNotice({ tone: "bad", text: "Only owners and admins can add knowledge." });
    if (!target) { setNotice({ tone: "bad", text: "Create a collection first." }); return setCreateOpen(true); }
    if (fileRef.current) { fileRef.current.accept = ACCEPT[kind]; fileRef.current.click(); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !target) return;
    setNotice(null);
    let failed: string | null = null;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { failed = `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB. Compress the PDF (for example, remove images) and try again.`; continue; }
      if (file.size === 0) { failed = `${file.name} is empty.`; continue; }
      setUploading((n) => n + 1);
      const body = new FormData();
      body.set("collectionId", target.id);
      body.set("file", file);
      try {
        const res = await fetch("/api/v1/knowledge/documents", { method: "POST", body });
        if (!res.ok) failed = (await res.json().catch(() => null))?.error?.message ?? `Could not upload ${file.name}.`;
      } catch { failed = file.size > 9.5 * 1048576 ? `${file.name} is too large to upload (limit 10 MB).` : `Could not upload ${file.name}. Check your connection.`; }
      setUploading((n) => n - 1);
    }
    if (fileRef.current) fileRef.current.value = "";
    setNotice(failed ? { tone: "bad", text: failed } : { tone: "ok", text: `Added to "${target.name}". Indexing started.` });
    await refresh();
  }

  async function removeDoc() {
    if (!delDoc) return;
    setBusy(true);
    const r = await api(`/api/v1/knowledge/documents/${delDoc.id}`, { method: "DELETE" });
    setBusy(false); setDelDoc(null);
    setNotice(r.ok ? { tone: "ok", text: "Document deleted." } : { tone: "bad", text: r.message });
    await refresh();
  }
  async function removeCollection() {
    if (!delCol) return;
    setBusy(true);
    const r = await api(`/api/v1/knowledge/collections/${delCol.id}`, { method: "DELETE" });
    setBusy(false);
    if (activeId === delCol.id) setActiveId(null);
    setDelCol(null);
    setNotice(r.ok ? { tone: "ok", text: "Collection deleted." } : { tone: "bad", text: r.message });
    await refresh();
  }
  async function reindex(d: DocumentDto) {
    const r = await api(`/api/v1/knowledge/documents/${d.id}/reindex`, { method: "POST", body: {} });
    if (!r.ok) setNotice({ tone: "bad", text: r.message });
    await refresh();
  }
  async function download(d: DocumentDto) {
    const r = await api<{ url: string }>(`/api/v1/knowledge/documents/${d.id}/download`);
    if (r.ok) window.open(r.data.url, "_blank", "noopener,noreferrer");
    else setNotice({ tone: "bad", text: r.message });
  }

  const tone = (c: CollectionDto) => c.tone as TileTone;
  const viewTabs = [
    { id: "collections", label: "Collections", icon: <Folder /> },
    { id: "documents", label: "All Documents", icon: <FileText /> },
    { id: "processing", label: "Processing", icon: <Loader2 />, count: docs.filter((d) => d.status !== "indexed").length || undefined },
    { id: "bots", label: "Linked Bots", icon: <Link2 /> },
  ];
  function changeView(id: string) {
    setView(id);
    if (id === "bots") setLower("bots"); else setLower("docs");
    if (id === "documents" || id === "processing") setActiveId(null);
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><BookOpen /></IconTile>
              <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Knowledge Base" /></h1><p className="text-sm text-foreground/80">Organize documents and knowledge sources for your bots.</p></div></div>
            <Image src="/images/illustrations/kb-docs.png" alt="" width={272} height={92} className="hidden h-20 w-auto fade-edges lg:block light:hidden" />
          </div>
          <Tabs label="Knowledge sections" value={view} onChange={changeView} tabs={viewTabs} />

          {view !== "documents" && view !== "processing" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Knowledge Collections ({collections.length})</h2>
                <div className="flex items-center gap-2 text-sm"><span className="text-muted">Sort by:</span>
                  <Select aria-label="Sort collections" className="w-40" value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated">Last Updated</option><option value="name">Name</option></Select>
                  <button type="button" aria-label="Grid view" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")} className={cn("grid-cols-1 grid size-9 place-items-center rounded-lg", layout === "grid" ? "btn-primary-bg text-white" : "panel")}><LayoutGrid className="size-4" /></button>
                  <button type="button" aria-label="List view" aria-pressed={layout === "list"} onClick={() => setLayout("list")} className={cn("grid-cols-1 grid size-9 place-items-center rounded-lg", layout === "list" ? "btn-primary-bg text-white" : "panel")}><List className="size-4" /></button></div></div>
              {collections.length === 0 ? (
                <Card className="flex flex-col items-center gap-3 p-10 text-center">
                  <IconTile size="xl"><Folder /></IconTile>
                  <h3 className="text-lg font-bold">No collections yet</h3>
                  <p className="max-w-sm text-sm text-muted">A collection groups related documents. Create one, add PDFs, text files or web pages, then share it with your bots.</p>
                  {canWrite && <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden />Create Collection</Button>}
                </Card>
              ) : (
                <ul className={cn("grid-cols-1 grid gap-4", layout === "grid" ? "sm:grid-cols-2 xl:grid-cols-4" : "")}>
                  {sortedCollections.map((c) => (
                    <li key={c.id}>
                      <Card glow={c.id === activeId} hover className={cn("h-full p-4", c.id === activeId && "ring-1 ring-lavender/60")}>
                        <div role="button" tabIndex={0} aria-pressed={c.id === activeId} aria-label={`${c.name}, ${c.documents} documents`} className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-lg"
                          onClick={() => setActiveId(c.id === activeId ? null : c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveId(c.id === activeId ? null : c.id); } }}>
                          <div className="flex items-start justify-between"><IconTile tone={tone(c)} size="lg"><Folder /></IconTile><Badge tone={c.botIds.length ? "success" : "neutral"} dot>{c.botIds.length} {c.botIds.length === 1 ? "Bot" : "Bots"}</Badge></div>
                          <h3 className="mt-3 truncate text-lg font-bold">{c.name}</h3><p className="text-xs text-muted">{c.documents} {c.documents === 1 ? "document" : "documents"}</p>
                          <p className="mt-2 flex items-center justify-between text-[11px] text-foreground/75"><span>{c.sizeBytes ? formatBytes(c.sizeBytes) : "-"}</span><span suppressHydrationWarning>Updated {formatDate(c.updatedAt)}</span></p>
                          <p className="mt-2 line-clamp-2 min-h-8 text-xs text-foreground/75">{c.description || "No description."}</p>
                        </div>
                        {canWrite && (
                          <div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-2">
                            <Tooltip content="Share with bots" side="top"><button type="button" aria-label={`Share ${c.name} with bots`} onClick={() => setSharing(c)} className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-foreground/10 hover:text-foreground"><Link2 className="size-4" /></button></Tooltip>
                            <Tooltip content="Edit" side="top"><button type="button" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)} className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-foreground/10 hover:text-foreground"><Pencil className="size-4" /></button></Tooltip>
                            <Tooltip content="Delete" side="top"><button type="button" aria-label={`Delete ${c.name}`} onClick={() => setDelCol(c)} className="ml-auto grid size-8 place-items-center rounded-md text-bad/80 transition hover:bg-danger/15 hover:text-bad"><Trash2 className="size-4" /></button></Tooltip>
                          </div>
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <Card>
            <div className="flex flex-wrap items-center gap-3 p-4">
              <Tabs label="Document view" value={lower} onChange={(v) => setLower(v as "docs" | "bots")} tabs={[{ id: "docs", label: "Documents", icon: <FileText /> }, { id: "bots", label: "Linked Bots", icon: <Link2 /> }]} className="!p-1" />
              {lower === "docs" && (
                <>
                  <Input aria-label="Search documents" icon={<Search />} placeholder="Search documents..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 max-w-xs flex-1" />
                  <Select aria-label="Type" className="w-32" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">All Types</option><option value="pdf">PDF</option><option value="txt">TXT</option><option value="md">Markdown</option><option value="url">URL</option></Select>
                  <Select aria-label="Status" className="w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All Status</option><option value="indexed">Indexed</option><option value="processing">Processing</option><option value="failed">Failed</option></Select>
                </>
              )}
              {active && <Badge tone="primary" className="rounded-full">{active.name}<button type="button" aria-label="Show all collections" onClick={() => setActiveId(null)} className="ml-1 text-lavender hover:text-foreground">&times;</button></Badge>}
              {uploading > 0 && <span className="flex items-center gap-1.5 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden />Uploading...</span>}
            </div>
            {lower === "docs" ? (
              <div className="overflow-x-auto px-4 pb-4">
                {shownDocs.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <FileText className="size-8 text-lavender" aria-hidden />
                    <p className="font-bold">{docs.length === 0 ? "No documents yet" : "No documents match"}</p>
                    <p className="max-w-sm text-sm text-muted">{docs.length === 0 ? "Upload a PDF, TXT or Markdown file, or add a web page, using the panel on the right." : "Change the filters or the search to see more."}</p>
                  </div>
                ) : (
                  <table className="rn-table min-w-[820px]">
                    <thead><tr><th>File Name <ArrowDownUp className="inline size-3" aria-hidden /></th><th>Collection</th><th>Type</th><th>Size</th><th>Processing Status</th><th>Uploaded On</th><th>Actions</th></tr></thead>
                    <tbody>
                      {shownDocs.map((d) => {
                        const t = TYPE_LABEL[d.kind];
                        return (
                          <tr key={d.id}>
                            <td><span className="flex items-center gap-2.5 font-semibold">{d.kind === "url" ? <Link2 className="size-5 text-muted" aria-hidden /> : <span className={cn("grid h-7 w-6 place-items-center rounded text-[8px] font-extrabold", typeCls[t])} aria-hidden>{t}</span>}<span className="max-w-[260px] truncate" title={d.name}>{d.name}</span></span>
                              {d.error && <span className={cn("mt-0.5 block max-w-[320px] text-[11px]", d.status === "failed" ? "text-bad" : "text-warn")}>{d.error}</span>}</td>
                            <td className="text-foreground/85">{d.collectionName}</td>
                            <td>{t}</td><td>{formatBytes(d.sizeBytes)}</td>
                            <td><span className="flex flex-col items-start gap-1"><Status doc={d} />{d.status === "indexed" && <span className="text-[10px] text-muted">{d.chunkCount} chunks &bull; {d.vectorIndexed ? "vectors" : "keywords"}</span>}</span></td>
                            <td className="text-foreground/85" suppressHydrationWarning>{formatDate(d.createdAt, true)}</td>
                            <td>
                              <span className="flex items-center gap-1 text-foreground/70">
                                <Tooltip content="View extracted text" side="top"><button type="button" aria-label={`View ${d.name}`} onClick={() => setPreviewId(d.id)} className="grid size-8 place-items-center rounded-md hover:bg-foreground/10 hover:text-foreground"><Eye className="size-4" /></button></Tooltip>
                                {canWrite && (d.status === "failed" || (d.status === "indexed" && !d.vectorIndexed && status.vector.configured)) && (
                                  <Tooltip content={d.status === "failed" ? "Try again" : "Index with vectors"} side="top"><button type="button" aria-label={`Re-index ${d.name}`} onClick={() => void reindex(d)} className="grid size-8 place-items-center rounded-md hover:bg-foreground/10 hover:text-foreground"><RefreshCw className="size-4" /></button></Tooltip>
                                )}
                                <Tooltip content={d.kind === "url" ? "Open page" : "Download"} side="top"><button type="button" aria-label={`${d.kind === "url" ? "Open" : "Download"} ${d.name}`} onClick={() => void download(d)} className="grid size-8 place-items-center rounded-md hover:bg-foreground/10 hover:text-foreground"><Download className="size-4" /></button></Tooltip>
                                {canWrite && <Tooltip content="Delete" side="top"><button type="button" aria-label={`Delete ${d.name}`} onClick={() => setDelDoc(d)} className="grid size-8 place-items-center rounded-md text-bad hover:bg-danger/15"><Trash2 className="size-4" /></button></Tooltip>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {shownDocs.length > 0 && <p className="mt-3 text-sm text-foreground/80">Showing {shownDocs.length} of {docs.length} documents</p>}
              </div>
            ) : (
              <div className="space-y-3 px-4 pb-4">
                {(active ? [active] : collections).length === 0 ? <p className="py-8 text-center text-sm text-muted">Create a collection to share it with bots.</p> : (active ? [active] : collections).map((c) => (
                  <div key={c.id} className="panel flex flex-wrap items-center gap-3 p-3">
                    <IconTile tone={tone(c)} size="md"><Folder /></IconTile>
                    <div className="min-w-0 flex-1"><p className="font-bold">{c.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">{c.botIds.length === 0 ? <span className="text-xs text-muted">Not shared with any bot yet.</span> : c.botIds.map((id) => { const b = botName(id); return b ? <Badge key={id} tone={b.kind === "agent" ? "primary" : "info"} className="rounded-full">{b.kind === "agent" && <Sparkles className="size-3" aria-hidden />}{b.name}</Badge> : null; })}</div></div>
                    {canWrite && <Button variant="outline" size="sm" onClick={() => setSharing(c)}><Link2 className="size-3.5" aria-hidden />Manage bots</Button>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-5" aria-label="Knowledge actions">
          <Button onClick={() => (canWrite ? setCreateOpen(true) : setNotice({ tone: "bad", text: "Only owners and admins can create collections." }))} className="h-12 w-full"><Plus className="size-4" aria-hidden />Create Collection</Button>
          <Card>
            <CardHeader title="Add Knowledge" description={target ? `Adding to "${target.name}".` : "Create a collection to start adding knowledge."} icon={<Cloud />} as="h3" />
            <div className="space-y-2.5 px-5 pb-5">
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} aria-label="Choose files to upload" />
              {([["Upload PDF", "PDF", "bg-danger/25 text-bad", "pdf"], ["Upload TXT", "TXT", "bg-info/25 text-sky", "txt"], ["Upload Markdown", "MD", "bg-primary/30 text-lavender", "md"]] as const).map(([l, t, c, k]) => (
                <button key={l} type="button" onClick={() => pick(k)} className="panel flex w-full items-center gap-3 p-2.5 text-left text-sm font-semibold transition hover:border-lavender/60"><span className={cn("grid size-8 place-items-center rounded text-[9px] font-extrabold", c)} aria-hidden>{t}</span>{l}</button>
              ))}
              <button type="button" onClick={() => { if (!canWrite) return setNotice({ tone: "bad", text: "Only owners and admins can add knowledge." }); if (!target) { setNotice({ tone: "bad", text: "Create a collection first." }); return setCreateOpen(true); } setUrlOpen(true); }}
                className="panel flex w-full items-center gap-3 p-2.5 text-left text-sm font-semibold transition hover:border-lavender/60"><Globe className="ml-1 size-6 text-lavender" aria-hidden />Add Website URL</button>
              <p className="text-[11px] text-muted">PDF, TXT and Markdown up to 10 MB. Click a collection to choose where files go.</p>
            </div>
          </Card>
          <SearchCard collections={collections} activeId={activeId} />
          <Card>
            <CardHeader title="RAG for your bots" icon={<Sparkles />} as="h3" />
            <p className="px-5 pb-5 text-xs text-foreground/75">Share a collection with any bot using the link icon on its card. AI agents and bots from the AI wizard answer from it; rule-based bots use it when no command or keyword matches. The Model Playground can use collections too.</p>
          </Card>
        </aside>
      </div>

      <CollectionModal open={createOpen || Boolean(editing)} collection={editing} onClose={() => { setCreateOpen(false); setEditing(null); }}
        onSaved={(created) => { setCreateOpen(false); setEditing(null); if (created) setActiveId(created.id); void refresh(); }} />
      <LinkBotsModal collection={sharing} bots={bots} onClose={() => setSharing(null)} onSaved={() => { setSharing(null); setNotice({ tone: "ok", text: "Linked bots updated." }); void refresh(); }} />
      <UrlModal open={urlOpen} collectionId={target?.id ?? ""} collectionName={target?.name ?? ""} onClose={() => setUrlOpen(false)} onAdded={() => { setUrlOpen(false); setNotice({ tone: "ok", text: "Page added. Indexing started." }); void refresh(); }} />
      <PreviewModal docId={previewId} onClose={() => setPreviewId(null)} />
      <Modal open={Boolean(delDoc)} onClose={() => setDelDoc(null)} title="Delete document?" icon={<IconTile tone="danger" size="md"><Trash2 /></IconTile>}
        footer={<><Button variant="outline" onClick={() => setDelDoc(null)}>Cancel</Button><Button variant="danger" onClick={removeDoc} disabled={busy}><Trash2 className="size-4" aria-hidden />Delete</Button></>}>
        &ldquo;{delDoc?.name}&rdquo; and its indexed text will be removed. Bots will no longer find it.
      </Modal>
      <Modal open={Boolean(delCol)} onClose={() => setDelCol(null)} title="Delete collection?" icon={<IconTile tone="danger" size="md"><Trash2 /></IconTile>}
        footer={<><Button variant="outline" onClick={() => setDelCol(null)}>Cancel</Button><Button variant="danger" onClick={removeCollection} disabled={busy}><Trash2 className="size-4" aria-hidden />Delete</Button></>}>
        &ldquo;{delCol?.name}&rdquo; and its {delCol?.documents ?? 0} documents will be removed, and bots lose access to them. This cannot be undone.
      </Modal>
    </div>
  );
}

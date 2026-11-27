"use client";
import {
  ArrowDownUp,
  BookOpen,
  CheckCircle2,
  Cloud,
  Download,
  Eye,
  FileText,
  Folder,
  Globe,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  XCircle,
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
import { formatBytes, formatDate, SCRAPE_MODE_LABEL, STAGE_LABEL, TYPE_LABEL } from "./format";
import { KnowledgeLogsPanel } from "./knowledge-logs-panel";
import { SearchCard } from "./search-card";

const typeCls: Record<string, string> = {
  PDF: "bg-danger/20 text-bad",
  WORD: "bg-info/25 text-sky",
  XLSX: "bg-success/20 text-ok",
  CSV: "bg-accent/20 text-accent",
  PPTX: "bg-warning/20 text-warn",
  TXT: "bg-info/20 text-sky",
  MD: "bg-primary/25 text-lavender",
  JSON: "bg-warning/15 text-warn",
  HTML: "bg-primary/20 text-lavender",
  URL: "bg-foreground/10 text-foreground/80",
};

const ACCEPT = {
  all: ".pdf,.docx,.doc,.odt,.rtf,.xlsx,.xls,.ods,.csv,.tsv,.pptx,.odp,.txt,.log,.md,.markdown,.mdx,.json,.jsonl,.yaml,.yml,.xml,.html,.htm,.xhtml",
  pdf: ".pdf,application/pdf",
  docx: ".docx,.doc,.odt,.rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/rtf",
  xlsx: ".xlsx,.xls,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
  csv: ".csv,.tsv,text/csv,text/tab-separated-values",
  pptx: ".pptx,.odp,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  text: ".txt,.log,.md,.markdown,.mdx,text/plain,text/markdown",
  structured: ".json,.jsonl,.yaml,.yml,.xml,application/json,application/xml,text/xml",
  html: ".html,.htm,.xhtml,text/html",
} as const;

const QUICK_UPLOAD_BUTTONS: ReadonlyArray<{
  label: string;
  tag: string;
  cls: string;
  acceptKey: keyof typeof ACCEPT;
}> = [
  { label: "PDF", tag: "PDF", cls: "bg-danger/25 text-bad", acceptKey: "pdf" },
  { label: "Word / RTF", tag: "DOCX", cls: "bg-info/25 text-sky", acceptKey: "docx" },
  { label: "Excel / ODS", tag: "XLSX", cls: "bg-success/20 text-ok", acceptKey: "xlsx" },
  { label: "CSV / TSV", tag: "CSV", cls: "bg-accent/20 text-accent", acceptKey: "csv" },
  { label: "Slides", tag: "PPTX", cls: "bg-warning/20 text-warn", acceptKey: "pptx" },
  { label: "TXT / MD", tag: "MD", cls: "bg-primary/30 text-lavender", acceptKey: "text" },
  { label: "JSON / XML", tag: "JSON", cls: "bg-warning/15 text-warn", acceptKey: "structured" },
  { label: "HTML", tag: "HTML", cls: "bg-primary/20 text-lavender", acceptKey: "html" },
];

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
  const [dragOver, setDragOver] = React.useState(false);
  const [logsOpen, setLogsOpen] = React.useState(() => props.documents.some((d) => d.status === "processing"));
  const [logDocId, setLogDocId] = React.useState<string | null>(() => props.documents.find((d) => d.status === "processing")?.id ?? null);
  const setNotice = (m: { tone: "ok" | "bad"; text: string } | null) => { if (m) toast[m.tone === "ok" ? "success" : "error"](m.text); };
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    const [c, d] = await Promise.all([api<CollectionDto[]>("/api/v1/knowledge/collections"), api<DocumentDto[]>("/api/v1/knowledge/documents")]);
    if (c.ok) setCollections(c.data);
    if (d.ok) setDocs(d.data);
  }, []);

  // While anything is being scraped or indexed, poll smoothly every 1.8s and show the live log console automatically.
  const pending = docs.some((d) => d.status === "processing");
  React.useEffect(() => {
    if (!pending) return;
    setLogsOpen(true);
    const t = setTimeout(() => void refresh(), 1800);
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

  async function upload(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    if (!canWrite) return setNotice({ tone: "bad", text: "Only owners and admins can add knowledge." });
    if (!target) { setNotice({ tone: "bad", text: "Create a collection first." }); return setCreateOpen(true); }
    setNotice(null);
    let failed: string | null = null;
    let lastUploadedId: string | null = null;
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) { failed = `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`; continue; }
      if (file.size === 0) { failed = `${file.name} is empty.`; continue; }
      setUploading((n) => n + 1);
      const body = new FormData();
      body.set("collectionId", target.id);
      body.set("file", file);
      try {
        const res = await fetch("/api/v1/knowledge/documents", { method: "POST", body });
        const json = await res.json().catch(() => null);
        if (!res.ok) failed = json?.error?.message ?? `Could not upload ${file.name}.`;
        else if (json?.data?.id) lastUploadedId = json.data.id as string;
      } catch { failed = file.size > 9.5 * 1048576 ? `${file.name} is too large to upload (limit 10 MB).` : `Could not upload ${file.name}. Check your connection.`; }
      setUploading((n) => n - 1);
    }
    if (fileRef.current) fileRef.current.value = "";
    if (lastUploadedId) {
      setLogDocId(lastUploadedId);
      setLogsOpen(true);
    }
    setNotice(failed ? { tone: "bad", text: failed } : { tone: "ok", text: `Added to "${target.name}". Processing started.` });
    await refresh();
  }

  async function removeDoc() {
    if (!delDoc) return;
    setBusy(true);
    const r = await api(`/api/v1/knowledge/documents/${delDoc.id}`, { method: "DELETE" });
    setBusy(false);
    if (logDocId === delDoc.id) setLogDocId(null);
    setDelDoc(null);
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
    const r = await api<DocumentDto>(`/api/v1/knowledge/documents/${d.id}/reindex`, { method: "POST", body: {} });
    if (!r.ok) {
      setNotice({ tone: "bad", text: r.message });
    } else {
      setLogDocId(d.id);
      setLogsOpen(true);
      setNotice({ tone: "ok", text: d.kind === "url" ? "Re-scraping started. Follow progress in live logs." : "Re-indexing started." });
    }
    await refresh();
  }
  async function download(d: DocumentDto) {
    const r = await api<{ url: string }>(`/api/v1/knowledge/documents/${d.id}/download`);
    if (r.ok) window.open(r.data.url, "_blank", "noopener,noreferrer");
    else setNotice({ tone: "bad", text: r.message });
  }

  function openLogsFor(d: DocumentDto) {
    setLogDocId(d.id);
    setLogsOpen(true);
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
    if (id === "processing") setLogsOpen(true);
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><BookOpen /></IconTile>
              <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Knowledge Base" /></h1><p className="text-sm text-foreground/80">Organize documents, spreadsheets, and crawled web pages for your bots.</p></div></div>
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
                  <p className="max-w-sm text-sm text-muted">A collection groups related documents. Create one, upload PDFs, Word, Excel, CSV, presentations or crawl websites and sitemaps, then share it with your bots.</p>
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

          {/* Live Scraping & Processing Logs Console */}
          {(logsOpen || pending || view === "processing") && (
            <KnowledgeLogsPanel
              documents={docs}
              selectedDocId={logDocId}
              onSelectDoc={setLogDocId}
              onClose={() => setLogsOpen(false)}
              onDocsUpdated={setDocs}
            />
          )}

          <Card>
            <div className="flex flex-wrap items-center gap-3 p-4">
              <Tabs label="Document view" value={lower} onChange={(v) => setLower(v as "docs" | "bots")} tabs={[{ id: "docs", label: "Documents", icon: <FileText /> }, { id: "bots", label: "Linked Bots", icon: <Link2 /> }]} className="!p-1" />
              {lower === "docs" && (
                <>
                  <Input aria-label="Search documents" icon={<Search />} placeholder="Search documents..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 max-w-xs flex-1" />
                  <Select aria-label="Type" className="w-36" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="all">All Types</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">Word / RTF</option>
                    <option value="xlsx">Excel / ODS</option>
                    <option value="csv">CSV / TSV</option>
                    <option value="pptx">PowerPoint</option>
                    <option value="txt">TXT</option>
                    <option value="md">Markdown</option>
                    <option value="json">JSON / XML</option>
                    <option value="html">HTML</option>
                    <option value="url">Website / Crawl</option>
                  </Select>
                  <Select aria-label="Status" className="w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All Status</option><option value="indexed">Indexed</option><option value="processing">Processing</option><option value="failed">Failed</option></Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLogsOpen((o) => !o)}
                    className="h-10"
                  >
                    <Terminal className="size-3.5" aria-hidden />
                    {logsOpen ? "Hide Logs" : "Logs"}
                  </Button>
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
                    <p className="max-w-sm text-sm text-muted">{docs.length === 0 ? "Upload PDF, Word, Excel, CSV, PowerPoint, Markdown, TXT, JSON, or crawl a website/sitemap using the panel on the right." : "Change the filters or the search to see more."}</p>
                  </div>
                ) : (
                  <table className="rn-table min-w-[860px]">
                    <thead><tr><th>File Name <ArrowDownUp className="inline size-3" aria-hidden /></th><th>Collection</th><th>Type</th><th>Size</th><th>Processing Status</th><th>Uploaded On</th><th>Actions</th></tr></thead>
                    <tbody>
                      {shownDocs.map((d) => {
                        const t = TYPE_LABEL[d.kind] ?? d.kind.toUpperCase();
                        const progressDetail =
                          d.status === "processing"
                            ? d.pagesTotal > 0
                              ? `${STAGE_LABEL[d.progressStage ?? "scraping"] ?? "Scraping"} (${d.pagesScraped}/${d.pagesTotal})`
                              : STAGE_LABEL[d.progressStage ?? "queued"] ?? "Working..."
                            : null;
                        return (
                          <tr key={d.id}>
                            <td>
                              <span className="flex items-center gap-2.5 font-semibold">
                                {d.kind === "url" ? (
                                  <Globe className="size-5 shrink-0 text-lavender" aria-hidden />
                                ) : (
                                  <span className={cn("grid h-7 min-w-8 shrink-0 place-items-center rounded px-1 text-[8px] font-extrabold", typeCls[t] ?? "bg-foreground/10 text-foreground/80")} aria-hidden>
                                    {t}
                                  </span>
                                )}
                                <span className="max-w-[260px] truncate" title={d.name}>{d.name}</span>
                              </span>
                              {d.kind === "url" && d.scrapeMode !== "single" && (
                                <span className="mt-0.5 block text-[11px] text-lavender/90">
                                  {SCRAPE_MODE_LABEL[d.scrapeMode]}
                                  {d.pagesScraped > 0 ? ` · ${d.pagesScraped} ${d.pagesScraped === 1 ? "page" : "pages"}` : ""}
                                  {d.pagesFailed > 0 ? ` (${d.pagesFailed} skipped)` : ""}
                                </span>
                              )}
                              {d.error && <span className={cn("mt-0.5 block max-w-[320px] text-[11px]", d.status === "failed" ? "text-bad" : "text-warn")}>{d.error}</span>}
                            </td>
                            <td className="text-foreground/85">{d.collectionName}</td>
                            <td>{t}</td><td>{formatBytes(d.sizeBytes)}</td>
                            <td>
                              <span className="flex flex-col items-start gap-1">
                                <Status doc={d} />
                                {progressDetail && (
                                  <button
                                    type="button"
                                    onClick={() => openLogsFor(d)}
                                    className="text-left text-[10px] text-sky underline-offset-2 hover:underline"
                                  >
                                    {progressDetail} · View logs
                                  </button>
                                )}
                                {d.status === "indexed" && (
                                  <span className="text-[10px] text-muted">
                                    {d.chunkCount} chunks &bull; {d.vectorIndexed ? "vectors" : "keywords"}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="text-foreground/85" suppressHydrationWarning>{formatDate(d.createdAt, true)}</td>
                            <td>
                              <span className="flex items-center gap-1 text-foreground/70">
                                <Tooltip content="View scraping & processing logs" side="top">
                                  <button type="button" aria-label={`Logs for ${d.name}`} onClick={() => openLogsFor(d)} className="grid size-8 place-items-center rounded-md hover:bg-foreground/10 hover:text-foreground">
                                    <Terminal className="size-4" />
                                  </button>
                                </Tooltip>
                                <Tooltip content="View extracted text" side="top">
                                  <button type="button" aria-label={`View ${d.name}`} onClick={() => setPreviewId(d.id)} className="grid size-8 place-items-center rounded-md hover:bg-foreground/10 hover:text-foreground">
                                    <Eye className="size-4" />
                                  </button>
                                </Tooltip>
                                {canWrite && (d.status === "failed" || d.kind === "url" || (d.status === "indexed" && !d.vectorIndexed && status.vector.configured)) && d.status !== "processing" && (
                                  <Tooltip content={d.status === "failed" ? "Retry" : d.kind === "url" ? "Re-scrape URL" : "Index with vectors"} side="top">
                                    <button type="button" aria-label={`Re-index ${d.name}`} onClick={() => void reindex(d)} className="grid size-8 place-items-center rounded-md hover:bg-foreground/10 hover:text-foreground">
                                      <RefreshCw className="size-4" />
                                    </button>
                                  </Tooltip>
                                )}
                                <Tooltip content={d.kind === "url" ? "Open page" : "Download"} side="top">
                                  <button type="button" aria-label={`${d.kind === "url" ? "Open" : "Download"} ${d.name}`} onClick={() => void download(d)} className="grid size-8 place-items-center rounded-md hover:bg-foreground/10 hover:text-foreground">
                                    <Download className="size-4" />
                                  </button>
                                </Tooltip>
                                {canWrite && (
                                  <Tooltip content="Delete" side="top">
                                    <button type="button" aria-label={`Delete ${d.name}`} onClick={() => setDelDoc(d)} className="grid size-8 place-items-center rounded-md text-bad hover:bg-danger/15">
                                      <Trash2 className="size-4" />
                                    </button>
                                  </Tooltip>
                                )}
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
            <div className="space-y-3 px-5 pb-5">
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} aria-label="Choose files to upload" />

              {/* Drag-and-drop multi-format dropzone */}
              <button
                type="button"
                onClick={() => pick("all")}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void upload(e.dataTransfer.files);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed p-3.5 text-center transition",
                  dragOver
                    ? "border-lavender bg-primary/15 text-foreground"
                    : "border-border bg-surface-2/40 hover:border-lavender/60 hover:bg-surface-2/70",
                )}
              >
                <Upload className="size-5 text-lavender" aria-hidden />
                <span className="text-xs font-bold">Upload Any Supported File</span>
                <span className="text-[11px] text-muted">Drop files here or click to browse</span>
              </button>

              {/* Quick format picker grid */}
              <div className="grid grid-cols-2 gap-2">
                {QUICK_UPLOAD_BUTTONS.map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => pick(btn.acceptKey)}
                    className="panel flex items-center gap-2 p-2 text-left text-xs font-semibold transition hover:border-lavender/60"
                  >
                    <span className={cn("grid h-6 min-w-8 shrink-0 place-items-center rounded px-1 text-[8px] font-extrabold", btn.cls)} aria-hidden>
                      {btn.tag}
                    </span>
                    <span className="truncate">{btn.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!canWrite) return setNotice({ tone: "bad", text: "Only owners and admins can add knowledge." });
                  if (!target) { setNotice({ tone: "bad", text: "Create a collection first." }); return setCreateOpen(true); }
                  setUrlOpen(true);
                }}
                className="panel flex w-full items-center gap-3 p-2.5 text-left text-sm font-semibold transition hover:border-lavender/60"
              >
                <Globe className="ml-1 size-5 shrink-0 text-lavender" aria-hidden />
                <div className="min-w-0">
                  <span className="block leading-tight">Add Website / Sitemap</span>
                  <span className="block text-[11px] font-normal text-muted">Single page, sitemap.xml, or subpages</span>
                </div>
              </button>

              <p className="text-[11px] text-muted">
                Supports PDF, Word (.docx/.doc/.odt/.rtf), Excel (.xlsx/.xls/.ods), CSV/TSV, PowerPoint (.pptx/.odp), TXT, Markdown, JSON/YAML/XML &amp; HTML up to 10 MB.
              </p>
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
      <UrlModal
        open={urlOpen}
        collectionId={target?.id ?? ""}
        collectionName={target?.name ?? ""}
        onClose={() => setUrlOpen(false)}
        onAdded={(doc) => {
          setUrlOpen(false);
          setLogDocId(doc.id);
          setLogsOpen(true);
          setNotice({
            tone: "ok",
            text:
              doc.scrapeMode === "single"
                ? "Page added. Scraping started — view live logs below."
                : `${SCRAPE_MODE_LABEL[doc.scrapeMode]} scrape started — follow live logs below.`,
          });
          void refresh();
        }}
      />
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

"use client";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Folder,
  FolderInput,
  FolderKanban,
  Globe,
  Info,
  Link2,
  Loader2,
  Map as MapIcon,
  Network,
  Search,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import * as React from "react";
import type { ScrapeMode } from "@backend/server/knowledge/scrape";
import type {
  CollectionDto,
  DocumentDto,
  DocumentPreviewChunk,
  IngestionLogDto,
  LinkableBotDto,
} from "@backend/server/services/knowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatBytes, formatDate, formatLogTime, SCRAPE_MODE_LABEL, TYPE_LABEL } from "./format";

const TONES: { id: CollectionDto["tone"]; cls: string }[] = [
  { id: "primary", cls: "bg-primary" },
  { id: "info", cls: "bg-info" },
  { id: "success", cls: "bg-success" },
  { id: "amber", cls: "bg-warning" },
];

/** Create or edit a collection/project — including selecting which existing knowledge documents belong to it. */
export function CollectionModal({
  open,
  collection,
  documents,
  onClose,
  onSaved,
}: {
  open: boolean;
  collection: CollectionDto | null;
  documents: DocumentDto[];
  onClose: () => void;
  onSaved: (created?: CollectionDto) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tone, setTone] = React.useState<CollectionDto["tone"]>("primary");
  const [selectedDocs, setSelectedDocs] = React.useState<Set<string>>(new Set());
  const [docQuery, setDocQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (!open) return;
    setName(collection?.name ?? "");
    setDescription(collection?.description ?? "");
    setTone(collection?.tone ?? "primary");
    setSelectedDocs(new Set(collection?.documentIds ?? []));
    setDocQuery("");
    setError(undefined);
  }, [open, collection]);

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredDocs = React.useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    return q ? documents.filter((d) => d.name.toLowerCase().includes(q)) : documents;
  }, [documents, docQuery]);

  async function save() {
    setBusy(true);
    setError(undefined);
    const documentIds = [...selectedDocs];
    const r = collection
      ? await api(`/api/v1/knowledge/collections/${collection.id}`, {
          method: "PATCH",
          body: { name, description, tone, documentIds },
        })
      : await api<CollectionDto>("/api/v1/knowledge/collections", {
          body: { name, description, tone, ...(documentIds.length ? { documentIds } : {}) },
        });
    setBusy(false);
    if (!r.ok) return setError(r.details[0]?.message ?? r.message);
    onSaved(collection ? undefined : (r.data as CollectionDto));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={collection ? "Edit Collection" : "Create Collection"}
      className="max-w-lg"
      icon={<IconTile tone="primary" size="md"><Folder /></IconTile>}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {collection ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="kb-name" required counter={`${name.length} / 80`}>
          <Input id="kb-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Product Docs" />
        </Field>
        <Field label="Description" htmlFor="kb-desc" counter={`${description.length} / 300`}>
          <Textarea id="kb-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" placeholder="What does this collection contain?" />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Colour</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Collection colour">
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tone === t.id}
                aria-label={t.id}
                onClick={() => setTone(t.id)}
                className={cn("size-8 rounded-full transition", t.cls, tone === t.id ? "ring-2 ring-lavender ring-offset-2 ring-offset-surface" : "opacity-70 hover:opacity-100")}
              />
            ))}
          </div>
        </div>

        {documents.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border/80 bg-surface-2/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Assigned Knowledge ({selectedDocs.size})
              </p>
              <span className="text-[11px] text-muted">Syncs Supabase &amp; Milvus</span>
            </div>
            {documents.length > 5 && (
              <Input
                aria-label="Filter documents"
                icon={<Search />}
                placeholder="Filter existing knowledge..."
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                className="h-9"
              />
            )}
            <ul className="max-h-40 space-y-1.5 overflow-auto pr-1">
              {filteredDocs.map((d) => {
                const onlyHere =
                  Boolean(collection) &&
                  d.collectionIds.length === 1 &&
                  d.collectionIds[0] === collection!.id;
                const checked = selectedDocs.has(d.id);
                return (
                  <li key={d.id} className="panel flex items-center justify-between gap-2 px-2.5 py-2">
                    <Checkbox
                      checked={checked}
                      disabled={onlyHere && checked}
                      onChange={() => toggleDoc(d.id)}
                      label={
                        <span className="flex min-w-0 items-center gap-1.5 text-xs">
                          <span className="rounded bg-foreground/10 px-1 py-0.5 text-[9px] font-bold uppercase text-foreground/80">
                            {TYPE_LABEL[d.kind] ?? d.kind}
                          </span>
                          <span className="max-w-[230px] truncate font-medium" title={d.name}>{d.name}</span>
                        </span>
                      }
                    />
                    {onlyHere ? (
                      <span className="shrink-0 text-[10px] text-muted">Only here</span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted">{d.collectionNames.slice(0, 2).join(", ")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

/** Manage which workspace knowledge documents are assigned to one collection/project. */
export function ManageCollectionDocsModal({
  collection,
  documents,
  onClose,
  onSaved,
}: {
  collection: CollectionDto | null;
  documents: DocumentDto[];
  onClose: () => void;
  onSaved: (summary: { count: number; vectorSyncedCount: number }) => void;
}) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    setPicked(new Set(collection?.documentIds ?? []));
    setSearch("");
    setError(undefined);
  }, [collection]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? documents.filter((d) => d.name.toLowerCase().includes(q)) : documents;
  }, [documents, search]);

  async function save() {
    if (!collection) return;
    setBusy(true);
    setError(undefined);
    const r = await api<{ documentIds: string[]; vectorSyncedCount: number }>(
      `/api/v1/knowledge/collections/${collection.id}/documents`,
      { method: "PUT", body: { documentIds: [...picked] } },
    );
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onSaved({ count: r.data.documentIds.length, vectorSyncedCount: r.data.vectorSyncedCount });
  }

  return (
    <Modal
      open={Boolean(collection)}
      onClose={onClose}
      title={`Knowledge in "${collection?.name ?? ""}"`}
      className="max-w-lg"
      icon={<IconTile tone="primary" size="md"><FolderKanban /></IconTile>}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save Assignment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Choose which knowledge documents are assigned to this collection. Documents can be shared across multiple collections — updates sync both Supabase and Milvus vectors.
        </p>
        {documents.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-2/60 p-4 text-center text-xs text-muted">
            No documents uploaded yet. Upload files or crawl a website from the panel on the right.
          </p>
        ) : (
          <>
            <Input
              aria-label="Search workspace documents"
              icon={<Search />}
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
            <ul className="max-h-[320px] space-y-1.5 overflow-auto pr-1">
              {filtered.map((d) => {
                const onlyHere =
                  Boolean(collection) &&
                  d.collectionIds.length === 1 &&
                  d.collectionIds[0] === collection!.id;
                const checked = picked.has(d.id);
                return (
                  <li key={d.id} className="panel flex items-start justify-between gap-3 p-2.5">
                    <Checkbox
                      checked={checked}
                      disabled={onlyHere && checked}
                      onChange={() => toggle(d.id)}
                      label={
                        <span className="block min-w-0">
                          <span className="flex items-center gap-1.5 font-semibold">
                            <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-foreground/80">
                              {TYPE_LABEL[d.kind] ?? d.kind}
                            </span>
                            <span className="max-w-[240px] truncate text-xs" title={d.name}>{d.name}</span>
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {onlyHere
                              ? "Only assigned to this collection (assign elsewhere to move)"
                              : `In: ${d.collectionNames.join(", ")}`}
                          </span>
                        </span>
                      }
                    />
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={d.status === "indexed" ? "success" : d.status === "failed" ? "danger" : "info"}>
                        {d.status}
                      </Badge>
                      {d.status === "indexed" && (
                        <span className="text-[10px] text-muted">{d.chunkCount} ch · {d.vectorIndexed ? "Milvus" : "KW"}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Database className="size-3.5 text-lavender" aria-hidden />
              {picked.size} of {documents.length} document{documents.length === 1 ? "" : "s"} selected for &ldquo;{collection?.name}&rdquo;.
            </p>
          </>
        )}
        {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

/** Reassign or share a single document across one or more collections/projects (syncs Supabase + Milvus). */
export function AssignDocCollectionsModal({
  document,
  collections,
  onClose,
  onSaved,
}: {
  document: DocumentDto | null;
  collections: CollectionDto[];
  onClose: () => void;
  onSaved: (res: { document: DocumentDto; vectorSynced: boolean; vectorsUpdated: number }) => void;
}) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    setPicked(new Set(document?.collectionIds ?? (document ? [document.collectionId] : [])));
    setError(undefined);
  }, [document]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function save() {
    if (!document || picked.size === 0) return;
    setBusy(true);
    setError(undefined);
    const r = await api<{ document: DocumentDto; vectorSynced: boolean; vectorsUpdated: number }>(
      `/api/v1/knowledge/documents/${document.id}`,
      { method: "PATCH", body: { collectionIds: [...picked] } },
    );
    setBusy(false);
    if (!r.ok) return setError(r.details[0]?.message ?? r.message);
    onSaved(r.data);
  }

  return (
    <Modal
      open={Boolean(document)}
      onClose={onClose}
      title="Assign Collections"
      icon={<IconTile tone="primary" size="md"><FolderInput /></IconTile>}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || picked.size === 0}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save Assignment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Choose which collection(s) <strong className="text-foreground">{document?.name}</strong> belongs to. Uncheck the current collection and select another to move it, or select multiple to share it.
        </p>
        <ul className="max-h-[300px] space-y-1.5 overflow-auto pr-1">
          {collections.map((c) => (
            <li key={c.id} className="panel flex items-center justify-between gap-3 p-2.5">
              <Checkbox
                checked={picked.has(c.id)}
                onChange={() => toggle(c.id)}
                label={
                  <span className="block">
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 text-xs font-normal text-muted">
                      {c.documents} {c.documents === 1 ? "doc" : "docs"}
                    </span>
                  </span>
                }
              />
              {picked.has(c.id) && [...picked][0] === c.id && (
                <Badge tone="primary">Primary</Badge>
              )}
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <Database className="size-3.5 text-lavender" aria-hidden />
          Updates Supabase chunks &amp; Milvus vector DB automatically.
        </p>
        {picked.size === 0 && <p role="alert" className="text-xs text-warn">Select at least one collection.</p>}
        {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

/** Choose which bots (rule-based, AI and AI agent bots) can answer from a collection. */
export function LinkBotsModal({ collection, bots, onClose, onSaved }: { collection: CollectionDto | null; bots: LinkableBotDto[]; onClose: () => void; onSaved: () => void }) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  React.useEffect(() => { setPicked(new Set(collection?.botIds ?? [])); setError(undefined); }, [collection]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function save() {
    if (!collection) return;
    setBusy(true); setError(undefined);
    const r = await api(`/api/v1/knowledge/collections/${collection.id}/bots`, { method: "PUT", body: { botIds: [...picked] } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onSaved();
  }
  const groups = [{ title: "AI agent bots", icon: <Sparkles className="size-3.5" />, items: bots.filter((b) => b.kind === "agent") }, { title: "Bots", icon: <Bot className="size-3.5" />, items: bots.filter((b) => b.kind === "bot") }];
  return (
    <Modal open={Boolean(collection)} onClose={onClose} title={`Share "${collection?.name ?? ""}"`} icon={<IconTile tone="primary" size="md"><Link2 /></IconTile>}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}Save</Button></>}>
      <p className="mb-3 text-muted">Linked bots search this collection ({collection?.documents ?? 0} {collection?.documents === 1 ? "document" : "documents"}) before they answer. Rule-based bots use it when no command or keyword rule matches.</p>
      {bots.length === 0 ? <p className="rounded-lg border border-border bg-surface-2/60 p-4 text-center text-muted">Create a bot first, then share this collection with it.</p> : (
        <div className="max-h-[320px] space-y-4 overflow-auto pr-1">
          {groups.filter((g) => g.items.length).map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">{g.icon}{g.title}</p>
              <ul className="space-y-1.5">
                {g.items.map((b) => (
                  <li key={b.id} className="panel flex items-center justify-between gap-3 p-2.5">
                    <Checkbox checked={picked.has(b.id)} onChange={() => toggle(b.id)} label={<span className="font-semibold">{b.name}{b.username && <span className="ml-1.5 text-xs font-normal text-muted">@{b.username}</span>}</span>} />
                    <Badge tone={b.status === "active" ? "success" : "neutral"} dot>{b.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-medium text-bad">{error}</p>}
    </Modal>
  );
}

const SCRAPE_MODES: Array<{ id: ScrapeMode; title: string; desc: string; icon: React.ReactNode }> = [
  { id: "single", title: "Single Page", desc: "Scrape one exact URL", icon: <Globe className="size-4" aria-hidden /> },
  { id: "sitemap", title: "Sitemap", desc: "Auto-discover or parse sitemap.xml", icon: <MapIcon className="size-4" aria-hidden /> },
  { id: "subpages", title: "Subpages", desc: "Crawl linked pages recursively", icon: <Network className="size-4" aria-hidden /> },
];

/** Adds a public web page, XML sitemap, or recursive subpages crawl as a knowledge source into chosen collection(s). */
export function UrlModal({
  open,
  collections,
  defaultCollectionIds,
  onClose,
  onAdded,
}: {
  open: boolean;
  collections: CollectionDto[];
  defaultCollectionIds: string[];
  onClose: () => void;
  onAdded: (doc: DocumentDto) => void;
}) {
  const [url, setUrl] = React.useState("");
  const [mode, setMode] = React.useState<ScrapeMode>("single");
  const [selectedCols, setSelectedCols] = React.useState<string[]>([]);
  const [maxPages, setMaxPages] = React.useState("15");
  const [maxDepth, setMaxDepth] = React.useState("2");
  const [samePathPrefix, setSamePathPrefix] = React.useState(true);
  const [pathPrefix, setPathPrefix] = React.useState("");
  const [excludeText, setExcludeText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) {
      setUrl("");
      setMode("single");
      const fallback = defaultCollectionIds.length
        ? defaultCollectionIds
        : collections[0]
          ? [collections[0].id]
          : [];
      setSelectedCols(fallback);
      setMaxPages("15");
      setMaxDepth("2");
      setSamePathPrefix(true);
      setPathPrefix("");
      setExcludeText("");
      setError(undefined);
    }
  }, [open, defaultCollectionIds, collections]);

  const toggleCol = (id: string) => {
    setSelectedCols((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((x) => x !== id)
          : prev
        : [...prev, id],
    );
  };

  async function add() {
    if (!selectedCols.length) return setError("Choose at least one collection.");
    setBusy(true);
    setError(undefined);
    const excludePatterns = excludeText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const base = {
      collectionId: selectedCols[0]!,
      ...(selectedCols.length > 1 ? { collectionIds: selectedCols } : {}),
      url: url.trim(),
      mode,
    };
    const payload =
      mode === "single"
        ? base
        : {
            ...base,
            maxPages: Number(maxPages) || 15,
            ...(mode === "subpages" ? { maxDepth: Number(maxDepth) || 2, samePathPrefix } : {}),
            ...(pathPrefix.trim() ? { pathPrefix: pathPrefix.trim() } : {}),
            ...(excludePatterns.length ? { excludePatterns } : {}),
          };
    const r = await api<DocumentDto>("/api/v1/knowledge/documents", { body: payload });
    setBusy(false);
    if (!r.ok) return setError(r.details[0]?.message ?? r.message);
    onAdded(r.data);
  }

  const placeholder =
    mode === "sitemap"
      ? "https://www.nseindia.in/sitemap.xml or https://docs.example.com"
      : mode === "subpages"
        ? "https://docs.example.com/guide"
        : "https://www.nseindia.in/all-reports";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Website, Sitemap or Subpages"
      className="max-w-lg"
      icon={<IconTile tone="primary" size="md"><Globe /></IconTile>}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={add} disabled={busy || !url.trim() || selectedCols.length === 0}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {mode === "single" ? "Scrape Page" : mode === "sitemap" ? "Scrape Sitemap" : "Crawl Subpages"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Target Collection(s) selector */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Assign to Collection(s)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {collections.map((c) => {
              const active = selectedCols.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleCol(c.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                    active
                      ? "border-lavender/70 bg-primary/20 text-foreground ring-1 ring-primary/40"
                      : "border-border bg-surface-2/50 text-muted hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <Folder className={cn("size-3.5", active ? "text-lavender" : "text-muted")} aria-hidden />
                  <span>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Scrape Mode</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Scrape mode">
            {SCRAPE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition",
                  mode === m.id
                    ? "border-lavender/70 bg-primary/15 text-foreground ring-1 ring-primary/40"
                    : "border-border bg-surface-2/50 text-muted hover:border-foreground/30 hover:text-foreground",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-xs font-bold", mode === m.id && "text-lavender")}>
                  {m.icon}
                  {m.title}
                </span>
                <span className="text-[11px] leading-snug text-muted">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Field
          label={mode === "sitemap" ? "Website or Sitemap URL" : "Starting URL"}
          htmlFor="kb-url"
          hint={
            mode === "sitemap"
              ? "Enter a direct sitemap.xml (.xml / .xml.gz) or any site URL to auto-discover via robots.txt."
              : mode === "subpages"
                ? "Starts at this page and follows same-domain links automatically. Live logs will stream while crawling."
                : "Public HTTPS page (or direct PDF/CSV/JSON link)."
          }
          error={error}
        >
          <Input
            id="kb-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !busy) void add(); }}
          />
        </Field>

        {mode !== "single" && (
          <div className="space-y-3 rounded-lg border border-border/80 bg-surface-2/40 p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max pages" htmlFor="kb-max-pages" hint="Up to 50 pages per run">
                <Select id="kb-max-pages" value={maxPages} onChange={(e) => setMaxPages(e.target.value)}>
                  <option value="5">5 pages</option>
                  <option value="10">10 pages</option>
                  <option value="15">15 pages</option>
                  <option value="25">25 pages</option>
                  <option value="50">50 pages</option>
                </Select>
              </Field>
              {mode === "subpages" ? (
                <Field label="Crawl depth" htmlFor="kb-max-depth" hint="Link hops from start URL">
                  <Select id="kb-max-depth" value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)}>
                    <option value="1">Depth 1 (direct links)</option>
                    <option value="2">Depth 2 (recommended)</option>
                    <option value="3">Depth 3 (deep crawl)</option>
                  </Select>
                </Field>
              ) : (
                <Field label="Path filter (optional)" htmlFor="kb-path-prefix" hint="e.g. /all-reports or /docs">
                  <Input
                    id="kb-path-prefix"
                    value={pathPrefix}
                    onChange={(e) => setPathPrefix(e.target.value)}
                    placeholder="/docs"
                  />
                </Field>
              )}
            </div>

            {mode === "subpages" && (
              <>
                <Checkbox
                  checked={samePathPrefix}
                  onChange={(e) => setSamePathPrefix(e.target.checked)}
                  label={<span className="text-xs">Stay within starting URL path prefix (recommended for docs sections)</span>}
                />
                <Field label="Custom path prefix (optional)" htmlFor="kb-sub-prefix" hint="Overrides automatic path scope, e.g. /market-data">
                  <Input
                    id="kb-sub-prefix"
                    value={pathPrefix}
                    onChange={(e) => setPathPrefix(e.target.value)}
                    placeholder="/docs"
                  />
                </Field>
              </>
            )}

            <Field label="Exclude URL patterns (optional)" htmlFor="kb-exclude" hint="Comma-separated substrings to skip">
              <Input
                id="kb-exclude"
                value={excludeText}
                onChange={(e) => setExcludeText(e.target.value)}
                placeholder="/login, /signup, /privacy, ?sort="
              />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface PreviewPayload {
  document: DocumentDto;
  chunks: DocumentPreviewChunk[];
  logs: IngestionLogDto[];
  pages: Array<{ url: string; title: string; chunks: number }>;
}

/** Shows extracted chunks, crawled pages, and persisted processing logs for one document. */
export function PreviewModal({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const [data, setData] = React.useState<PreviewPayload | null>(null);
  const [tab, setTab] = React.useState<"chunks" | "pages" | "logs">("chunks");
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async (id: string) => {
    const r = await api<PreviewPayload>(`/api/v1/knowledge/documents/${id}`);
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, []);

  React.useEffect(() => {
    setData(null);
    setError(undefined);
    setTab("chunks");
    if (!docId) return;
    void load(docId);
  }, [docId, load]);

  const isProcessing = data?.document.status === "processing";
  React.useEffect(() => {
    if (!docId || !isProcessing) return;
    const t = setInterval(() => void load(docId), 1500);
    return () => clearInterval(t);
  }, [docId, isProcessing, load]);

  const previewTabs = [
    { id: "chunks", label: "Chunks", icon: <FileText />, count: data?.document.chunkCount || undefined },
    ...(data?.pages.length ? [{ id: "pages", label: "Scraped Pages", icon: <Globe />, count: data.pages.length }] : []),
    { id: "logs", label: "Logs", icon: <Terminal />, count: data?.logs.length || undefined },
  ];

  return (
    <Modal open={Boolean(docId)} onClose={onClose} title={data?.document.name ?? "Document"} className="max-w-2xl">
      {error ? (
        <p className="text-bad">{error}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />Loading...</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted" suppressHydrationWarning>
            <span>{(data.document.collectionNames.length ? data.document.collectionNames : [data.document.collectionName]).join(", ")}</span>
            <span>&bull;</span>
            <span>{formatBytes(data.document.sizeBytes)}</span>
            <span>&bull;</span>
            <span>{data.document.chunkCount} chunks</span>
            <span>&bull;</span>
            <span>{data.document.vectorIndexed ? "Vector indexed" : "Keyword search"}</span>
            {data.document.kind === "url" && data.document.scrapeMode !== "single" && (
              <>
                <span>&bull;</span>
                <Badge tone="primary">{SCRAPE_MODE_LABEL[data.document.scrapeMode]}</Badge>
              </>
            )}
            <span>&bull;</span>
            <span>{formatDate(data.document.createdAt, true)}</span>
          </div>

          {data.document.error && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warn">{data.document.error}</p>
          )}

          <Tabs
            label="Preview sections"
            value={tab}
            onChange={(v) => setTab(v as "chunks" | "pages" | "logs")}
            tabs={previewTabs}
            className="!p-1"
          />

          {tab === "chunks" && (
            <>
              {data.chunks.length === 0 ? (
                <p className="py-4 text-muted">
                  {data.document.status === "processing"
                    ? "Extraction and scraping are still in progress. Switch to the Logs tab to follow live progress."
                    : "No text has been extracted yet."}
                </p>
              ) : (
                <ol className="max-h-[48vh] space-y-2 overflow-auto pr-1">
                  {data.chunks.map((c) => (
                    <li key={c.position} className="panel whitespace-pre-wrap p-3 text-[13px] leading-relaxed">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Chunk {c.position + 1}</span>
                        {c.sourceUrl && (
                          <a
                            href={c.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-[340px] items-center gap-1 truncate text-[11px] text-sky hover:underline"
                          >
                            <span className="truncate">{c.pageTitle || c.sourceUrl}</span>
                            <ExternalLink className="size-3 shrink-0" aria-hidden />
                          </a>
                        )}
                      </div>
                      {c.content}
                    </li>
                  ))}
                </ol>
              )}
              {data.document.chunkCount > data.chunks.length && (
                <p className="text-xs text-muted">Showing the first {data.chunks.length} of {data.document.chunkCount} chunks.</p>
              )}
            </>
          )}

          {tab === "pages" && (
            <ul className="max-h-[48vh] space-y-2 overflow-auto pr-1">
              {data.pages.map((p) => (
                <li key={p.url} className="panel flex items-center justify-between gap-3 p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{p.title}</p>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 truncate text-[11px] text-sky hover:underline"
                    >
                      <span className="truncate">{p.url}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  </div>
                  <Badge tone="neutral">{p.chunks} {p.chunks === 1 ? "chunk" : "chunks"}</Badge>
                </li>
              ))}
            </ul>
          )}

          {tab === "logs" && (
            <div className="max-h-[48vh] overflow-auto rounded-lg border border-border/80 bg-background/85 p-3 font-mono text-[12px] leading-relaxed">
              {data.logs.length === 0 ? (
                <p className="text-muted">No logs recorded for this document.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.logs.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-2 break-words">
                      <span className="shrink-0 text-[11px] text-muted" suppressHydrationWarning>{formatLogTime(entry.createdAt)}</span>
                      {entry.level === "success" ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                      ) : entry.level === "warn" ? (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                      ) : entry.level === "error" ? (
                        <XCircle className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden />
                      ) : (
                        <Info className="mt-0.5 size-3.5 shrink-0 text-sky" aria-hidden />
                      )}
                      <span className="shrink-0 rounded border border-border px-1 text-[10px] font-bold uppercase text-muted">{entry.stage}</span>
                      <span className="min-w-0 flex-1 text-foreground/90">{entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

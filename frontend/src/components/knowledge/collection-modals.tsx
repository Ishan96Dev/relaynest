"use client";
import { Bot, Folder, Globe, Link2, Loader2, Sparkles } from "lucide-react";
import * as React from "react";
import type { CollectionDto, DocumentDto, LinkableBotDto } from "@backend/server/services/knowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatBytes, formatDate } from "./format";

const TONES: { id: CollectionDto["tone"]; cls: string }[] = [
  { id: "primary", cls: "bg-primary" },
  { id: "info", cls: "bg-info" },
  { id: "success", cls: "bg-success" },
  { id: "amber", cls: "bg-warning" },
];

/** Create or rename a collection. */
export function CollectionModal({ open, collection, onClose, onSaved }: { open: boolean; collection: CollectionDto | null; onClose: () => void; onSaved: (created?: CollectionDto) => void }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tone, setTone] = React.useState<CollectionDto["tone"]>("primary");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    if (!open) return;
    setName(collection?.name ?? ""); setDescription(collection?.description ?? ""); setTone(collection?.tone ?? "primary"); setError(undefined);
  }, [open, collection]);
  async function save() {
    setBusy(true); setError(undefined);
    const r = collection
      ? await api(`/api/v1/knowledge/collections/${collection.id}`, { method: "PATCH", body: { name, description, tone } })
      : await api<CollectionDto>("/api/v1/knowledge/collections", { body: { name, description, tone } });
    setBusy(false);
    if (!r.ok) return setError(r.details[0]?.message ?? r.message);
    onSaved(collection ? undefined : (r.data as CollectionDto));
  }
  return (
    <Modal open={open} onClose={onClose} title={collection ? "Edit Collection" : "Create Collection"} icon={<IconTile tone="primary" size="md"><Folder /></IconTile>}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !name.trim()}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{collection ? "Save" : "Create"}</Button></>}>
      <div className="space-y-4">
        <Field label="Name" htmlFor="kb-name" required counter={`${name.length} / 80`}><Input id="kb-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Product Docs" /></Field>
        <Field label="Description" htmlFor="kb-desc" counter={`${description.length} / 300`}><Textarea id="kb-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" placeholder="What does this collection contain?" /></Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Colour</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Collection colour">
            {TONES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tone === t.id} aria-label={t.id} onClick={() => setTone(t.id)}
                className={cn("size-8 rounded-full transition", t.cls, tone === t.id ? "ring-2 ring-lavender ring-offset-2 ring-offset-surface" : "opacity-70 hover:opacity-100")} />
            ))}
          </div>
        </div>
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
      <p className="mb-3 text-muted">Linked bots search this collection before they answer. Rule-based bots use it when no command or keyword rule matches.</p>
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

/** Adds a public web page as a source. */
export function UrlModal({ open, collectionName, collectionId, onClose, onAdded }: { open: boolean; collectionName: string; collectionId: string; onClose: () => void; onAdded: () => void }) {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  React.useEffect(() => { if (open) { setUrl(""); setError(undefined); } }, [open]);
  async function add() {
    setBusy(true); setError(undefined);
    const r = await api("/api/v1/knowledge/documents", { body: { collectionId, url } });
    setBusy(false);
    if (!r.ok) return setError(r.details[0]?.message ?? r.message);
    onAdded();
  }
  return (
    <Modal open={open} onClose={onClose} title="Add Website URL" icon={<IconTile tone="primary" size="md"><Globe /></IconTile>}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={add} disabled={busy || !url.trim()}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}Add page</Button></>}>
      <div className="space-y-3">
        <Field label="Page address" htmlFor="kb-url" hint={`Public HTTPS page. It is read once and added to "${collectionName}".`} error={error}>
          <Input id="kb-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.example.com/getting-started" onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !busy) void add(); }} />
        </Field>
      </div>
    </Modal>
  );
}

/** Shows the text a document was split into, so the owner can check what the bots will see. */
export function PreviewModal({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const [data, setData] = React.useState<{ document: DocumentDto; chunks: { position: number; content: string }[] } | null>(null);
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    setData(null); setError(undefined);
    if (!docId) return;
    let live = true;
    void api<{ document: DocumentDto; chunks: { position: number; content: string }[] }>(`/api/v1/knowledge/documents/${docId}`).then((r) => { if (!live) return; if (r.ok) setData(r.data); else setError(r.message); });
    return () => { live = false; };
  }, [docId]);
  return (
    <Modal open={Boolean(docId)} onClose={onClose} title={data?.document.name ?? "Document"} className="max-w-2xl">
      {error ? <p className="text-bad">{error}</p> : !data ? <p className="flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />Loading...</p> : (
        <div className="space-y-3">
          <p className="text-xs text-muted" suppressHydrationWarning>{data.document.collectionName} &bull; {formatBytes(data.document.sizeBytes)} &bull; {data.document.chunkCount} chunks &bull; {data.document.vectorIndexed ? "Vector indexed" : "Keyword search"} &bull; {formatDate(data.document.createdAt, true)}</p>
          {data.document.error && <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warn">{data.document.error}</p>}
          {data.chunks.length === 0 ? <p className="text-muted">No text has been extracted yet.</p> : (
            <ol className="max-h-[50vh] space-y-2 overflow-auto pr-1">
              {data.chunks.map((c) => <li key={c.position} className="panel whitespace-pre-wrap p-3 text-[13px] leading-relaxed"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">Chunk {c.position + 1}</span>{c.content}</li>)}
            </ol>
          )}
          {data.document.chunkCount > data.chunks.length && <p className="text-xs text-muted">Showing the first {data.chunks.length} of {data.document.chunkCount} chunks.</p>}
        </div>
      )}
    </Modal>
  );
}

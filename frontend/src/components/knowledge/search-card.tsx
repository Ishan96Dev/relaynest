"use client";
import { Loader2, Search } from "lucide-react";
import * as React from "react";
import type { CollectionDto } from "@backend/server/services/knowledge";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

interface Hit { chunkId: string; document: string; collection: string; content: string; score: number }

/** Try a question against the knowledge base and see which passages a bot would receive. */
export function SearchCard({ collections, activeId }: { collections: CollectionDto[]; activeId: string | null }) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [out, setOut] = React.useState<{ mode: "vector" | "keyword" | "none"; results: Hit[] } | null>(null);
  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2 || busy) return;
    setBusy(true); setError(undefined);
    const r = await api<{ mode: "vector" | "keyword" | "none"; results: Hit[] }>("/api/v1/knowledge/search", { body: { query: q, ...(activeId ? { collectionIds: [activeId] } : {}) } });
    setBusy(false);
    if (r.ok) setOut(r.data); else { setOut(null); setError(r.message); }
  }
  const scope = activeId ? collections.find((c) => c.id === activeId)?.name : "all collections";
  return (
    <Card>
      <CardHeader title="Semantic Search" description={`Searching ${scope ?? "all collections"}.`} icon={<Search />} as="h3" />
      <div className="space-y-3 px-5 pb-5">
        <form onSubmit={run}><Input aria-label="Search the knowledge base" icon={busy ? <Loader2 className="animate-spin" /> : <Search />} placeholder="Ask a question..." value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} /></form>
        {error && <p role="alert" className="text-xs text-bad">{error}</p>}
        {out && (
          <div className="space-y-2">
            <Badge tone={out.mode === "vector" ? "success" : "neutral"} dot>{out.mode === "vector" ? "Vector search (Milvus)" : out.mode === "keyword" ? "Keyword search" : "No matches"}</Badge>
            <ul className="max-h-72 space-y-2 overflow-auto pr-1">
              {out.results.map((h) => (
                <li key={h.chunkId} className="panel p-2.5 text-xs">
                  <p className="flex items-center justify-between gap-2 font-semibold"><span className="truncate">{h.document}</span>{out.mode === "vector" && <span className="shrink-0 text-ok">{Math.round(h.score * 100)}%</span>}</p>
                  <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-foreground/80">{h.content}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

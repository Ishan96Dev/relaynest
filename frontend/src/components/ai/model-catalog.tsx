"use client";
import { Box, LayoutGrid, Search, Sparkles, Tag, Zap } from "lucide-react";
import * as React from "react";
import type { ModelDto } from "@backend/server/ai/model-catalog";
import { ModelCard } from "@/components/ai/model-card";
import { ModelDetail } from "@/components/ai/model-detail";
import { ProviderMark } from "@/components/ai/provider-mark";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/page-header";
import { FILTERS, matchesFilter, matchesQuery, type FilterId } from "@/lib/model-format";
import { cn } from "@/lib/utils";

const DESKTOP = "(min-width: 1280px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** True when the side panel fits next to the list (xl and up); below that, details open in a dialog. */
function useIsDesktop() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => true);
}

const chip = "rounded-lg border px-3 py-1.5 text-sm font-medium transition";
const chipOn = "border-transparent btn-primary-bg text-white";
const chipOff = "border-border bg-surface-2/70 text-foreground/85 hover:border-lavender/60 hover:bg-primary/10";

export function ModelCatalog({ models: initial, demo }: { models: ModelDto[]; demo: boolean }) {
  const [models, setModels] = React.useState(initial);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [provider, setProvider] = React.useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(() => (initial.find((m) => m.isFeatured) ?? initial[0])?.slug ?? null);
  const [dialog, setDialog] = React.useState(false);
  const [notice, setNotice] = React.useState<string>();
  const desktop = useIsDesktop();

  const selected = models.find((m) => m.slug === selectedSlug) ?? null;

  const providers = React.useMemo(() => {
    const map = new Map<string, { key: string; name: string }>();
    for (const m of models) if (!map.has(m.providerKey)) map.set(m.providerKey, { key: m.providerKey, name: m.providerName });
    return [...map.values()];
  }, [models]);

  const stats = React.useMemo(() => ({
    total: models.length,
    providers: providers.length,
    free: models.filter((m) => m.isFree).length,
    open: models.filter((m) => m.isOpenSource).length,
  }), [models, providers.length]);

  const filtering = q.trim() !== "" || filter !== "all" || provider !== null;
  const results = React.useMemo(
    () => models.filter((m) => matchesFilter(m, filter) && (!provider || m.providerKey === provider) && matchesQuery(m, q)),
    [models, filter, provider, q],
  );
  const featured = results.filter((m) => m.isFeatured);
  const rest = results.filter((m) => !m.isFeatured);

  function select(m: ModelDto) {
    setSelectedSlug(m.slug);
    if (!desktop) setDialog(true);
  }

  async function toggleFavorite(m: ModelDto) {
    const next = !m.favorite;
    setNotice(undefined);
    setModels((all) => all.map((x) => (x.slug === m.slug ? { ...x, favorite: next } : x)));
    if (demo) return; // demo mode has no account to save to
    try {
      const res = await fetch(`/api/v1/models/${encodeURIComponent(m.slug)}/favorite`, { method: next ? "PUT" : "DELETE" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setModels((all) => all.map((x) => (x.slug === m.slug ? { ...x, favorite: !next } : x)));
      setNotice("Could not update your favorites. Try again.");
    }
  }

  const grid = (list: ModelDto[], compact: boolean) => (
    <ul className={cn("grid grid-cols-1 gap-4", compact ? "@lg:grid-cols-2 @3xl:grid-cols-3" : "@xl:grid-cols-2")}>
      {list.map((m) => (
        <li key={m.slug} className="min-w-0">
          <ModelCard model={m} compact={compact} selected={desktop && m.slug === selectedSlug} onSelect={select} onToggleFavorite={toggleFavorite} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(400px,480px)]">
      <div className="@container min-w-0 space-y-5">
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <StatCard label="Total Models" value={String(stats.total)} icon={<Box />} tone="primary" />
          <StatCard label="Providers" value={String(stats.providers)} icon={<LayoutGrid />} tone="info" />
          <StatCard label="Free Models" value={String(stats.free)} icon={<Tag />} tone="warning" />
          <StatCard label="Open Source" value={String(stats.open)} icon={<Zap />} tone="primary" />
        </div>

        <Input aria-label="Search models" icon={<Search />} className="h-12" placeholder="Search models by name, provider or capability..." value={q} onChange={(e) => setQ(e.target.value)} />

        <div role="group" aria-label="Filter models" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cn(chip, filter === f.id ? chipOn : chipOff)}>{f.label}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground/85">Providers:</span>
          {providers.map((p) => (
            <button key={p.key} type="button" aria-pressed={provider === p.key} onClick={() => setProvider((cur) => (cur === p.key ? null : p.key))}
              className={cn(chip, "flex items-center gap-2 py-1", provider === p.key ? "border-lavender bg-primary/20 text-foreground" : chipOff)}>
              <ProviderMark providerKey={p.key} name={p.name} size="sm" className="size-6 rounded-md text-[10px]" />{p.name}
            </button>
          ))}
        </div>

        <p role="status" aria-live="polite" className="sr-only">{results.length} models shown</p>
        {notice && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-bad">{notice}</p>}

        {results.length === 0 ? (
          <Card><EmptyState title="No models match your filters" description="Try a different search, provider or category." icon={<Search className="size-10" />} /></Card>
        ) : filtering ? (
          <section aria-labelledby="results-title">
            <h2 id="results-title" className="mb-3 text-xl font-extrabold">Results <span className="text-base font-medium text-muted">({results.length})</span></h2>
            {grid(results, true)}
          </section>
        ) : (
          <>
            {featured.length > 0 && (
              <section aria-labelledby="featured-title">
                <div className="mb-3 flex items-center gap-3">
                  <IconTile tone="primary" size="md"><Sparkles /></IconTile>
                  <div>
                    <h2 id="featured-title" className="text-xl font-extrabold leading-tight">Featured Models</h2>
                    <p className="text-sm text-muted">Handpicked models for high-performance AI applications.</p>
                  </div>
                </div>
                {grid(featured, false)}
              </section>
            )}
            {rest.length > 0 && (
              <section aria-labelledby="more-title">
                <h2 id="more-title" className="mb-3 text-xl font-extrabold">More Models</h2>
                {grid(rest, true)}
              </section>
            )}
          </>
        )}
      </div>

      {desktop && (
        <aside aria-label="Model details" className="card sticky top-[88px] max-h-[calc(100vh-110px)] overflow-y-auto p-5">
          {selected ? (
            <ModelDetail model={selected} onClose={() => setSelectedSlug(null)} onToggleFavorite={toggleFavorite} />
          ) : (
            <EmptyState title="Select a model" description="Choose View Details on a model to see its specs, capabilities and an API example." icon={<Box className="size-10" />} />
          )}
        </aside>
      )}

      {!desktop && selected && (
        <Modal open={dialog} onClose={() => setDialog(false)} title="Model details" className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <ModelDetail model={selected} onToggleFavorite={toggleFavorite} />
        </Modal>
      )}
    </div>
  );
}

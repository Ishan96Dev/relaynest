"use client";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import * as React from "react";
import type { DocumentDto, IngestionLogDto } from "@backend/server/services/knowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatLogTime, SCRAPE_MODE_LABEL, STAGE_LABEL } from "./format";

interface Props {
  documents: DocumentDto[];
  selectedDocId: string | null;
  onSelectDoc: (id: string | null) => void;
  onClose?: () => void;
  onDocsUpdated?: React.Dispatch<React.SetStateAction<DocumentDto[]>>;
}

function LevelIcon({ level }: { level: IngestionLogDto["level"] }) {
  if (level === "success") return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />;
  if (level === "warn") return <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />;
  if (level === "error") return <XCircle className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden />;
  return <Info className="mt-0.5 size-3.5 shrink-0 text-sky" aria-hidden />;
}

const stageBadgeCls: Record<string, string> = {
  sitemap: "bg-primary/20 text-lavender border-primary/30",
  crawl: "bg-primary/20 text-lavender border-primary/30",
  scrape: "bg-info/15 text-sky border-info/30",
  fetch: "bg-info/15 text-sky border-info/30",
  fallback: "bg-warning/15 text-warn border-warning/30",
  extract: "bg-info/15 text-sky border-info/30",
  chunk: "bg-foreground/10 text-foreground/80 border-border",
  embed: "bg-primary/15 text-lavender border-primary/30",
  done: "bg-success/15 text-ok border-success/30",
  failed: "bg-danger/15 text-bad border-danger/30",
};

export function KnowledgeLogsPanel({ documents, selectedDocId, onSelectDoc, onClose, onDocsUpdated }: Props) {
  const [logs, setLogs] = React.useState<IngestionLogDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickBottom = React.useRef(true);

  const processingDocs = React.useMemo(() => documents.filter((d) => d.status === "processing"), [documents]);
  const activeDoc = React.useMemo(
    () =>
      (selectedDocId ? documents.find((d) => d.id === selectedDocId) : null) ??
      processingDocs[0] ??
      null,
    [documents, selectedDocId, processingDocs],
  );
  const isLive = activeDoc ? activeDoc.status === "processing" : processingDocs.length > 0;

  const fetchLogs = React.useCallback(async () => {
    const endpoint = selectedDocId
      ? `/api/v1/knowledge/documents/${selectedDocId}/logs`
      : "/api/v1/knowledge/logs?limit=150";
    if (selectedDocId) {
      const r = await api<{ document: DocumentDto; logs: IngestionLogDto[] }>(endpoint);
      if (r.ok) {
        setLogs(r.data.logs);
        const updated = r.data.document;
        onDocsUpdated?.((prev) => {
          const cur = prev.find((d) => d.id === updated.id);
          if (
            cur &&
            cur.status === updated.status &&
            cur.progressStage === updated.progressStage &&
            cur.pagesScraped === updated.pagesScraped &&
            cur.pagesTotal === updated.pagesTotal &&
            cur.pagesFailed === updated.pagesFailed &&
            cur.chunkCount === updated.chunkCount &&
            cur.error === updated.error &&
            cur.name === updated.name
          ) {
            return prev;
          }
          return prev.map((d) => (d.id === updated.id ? updated : d));
        });
      }
    } else {
      const r = await api<{ logs: IngestionLogDto[]; documents: DocumentDto[] }>(endpoint);
      if (r.ok) {
        setLogs(r.data.logs);
      }
    }
    setLoading(false);
  }, [selectedDocId, onDocsUpdated]);

  // Initial load + fast polling while scraping / processing is in progress
  React.useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await fetchLogs();
    };
    void run();
    if (!isLive) return () => { mounted = false; };
    const interval = setInterval(() => {
      void run();
    }, 1200);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchLogs, isLive]);

  // Auto-scroll to newest log entries unless user scrolled up
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
  };

  const progressPct =
    activeDoc && activeDoc.pagesTotal > 0
      ? Math.min(100, Math.round(((activeDoc.pagesScraped + activeDoc.pagesFailed) / activeDoc.pagesTotal) * 100))
      : null;

  const recentTabs = React.useMemo(() => {
    const picked: DocumentDto[] = [];
    const seen = new Set<string>();
    for (const d of processingDocs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        picked.push(d);
      }
    }
    if (selectedDocId && !seen.has(selectedDocId)) {
      const found = documents.find((d) => d.id === selectedDocId);
      if (found) {
        seen.add(found.id);
        picked.push(found);
      }
    }
    return picked.slice(0, 5);
  }, [processingDocs, selectedDocId, documents]);

  return (
    <Card className="overflow-hidden border-primary/35">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-surface-2/70 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/20 text-lavender">
            <Terminal className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold">Knowledge Scraping &amp; Processing Logs</h3>
              {isLive ? (
                <Badge tone="info">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Live
                </Badge>
              ) : activeDoc?.status === "failed" ? (
                <Badge tone="danger">Failed</Badge>
              ) : activeDoc?.status === "indexed" ? (
                <Badge tone="success">Completed</Badge>
              ) : null}
              {activeDoc?.kind === "url" && activeDoc.scrapeMode !== "single" && (
                <Badge tone="primary">{SCRAPE_MODE_LABEL[activeDoc.scrapeMode]}</Badge>
              )}
            </div>
            {activeDoc && (
              <p className="truncate text-[11px] text-muted">
                {activeDoc.name}
                {activeDoc.progressStage && STAGE_LABEL[activeDoc.progressStage]
                  ? ` · ${STAGE_LABEL[activeDoc.progressStage]}`
                  : ""}
                {activeDoc.pagesTotal > 0
                  ? ` · ${activeDoc.pagesScraped}/${activeDoc.pagesTotal} scraped${activeDoc.pagesFailed ? ` (${activeDoc.pagesFailed} skipped)` : ""}`
                  : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Refresh logs"
            onClick={() => void fetchLogs()}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
          <button
            type="button"
            aria-label={collapsed ? "Expand logs" : "Collapse logs"}
            onClick={() => setCollapsed((c) => !c)}
            className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-foreground/10 hover:text-foreground"
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
          {onClose && !isLive && (
            <button
              type="button"
              aria-label="Close logs panel"
              onClick={onClose}
              className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar while multi-page scraping or indexing */}
      {isLive && (
        <div className="h-1 w-full overflow-hidden bg-surface-2">
          <div
            className={cn(
              "h-full bg-gradient-to-r from-primary via-lavender to-accent transition-all duration-300",
              progressPct === null && "w-1/2 animate-pulse",
            )}
            style={progressPct !== null ? { width: `${Math.max(8, progressPct)}%` } : undefined}
          />
        </div>
      )}

      {!collapsed && (
        <div className="space-y-2.5 p-3">
          {recentTabs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectDoc(null)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-semibold transition",
                  selectedDocId === null
                    ? "border-primary/50 bg-primary/20 text-lavender"
                    : "border-border/70 bg-surface-2/60 text-muted hover:text-foreground",
                )}
              >
                All recent
              </button>
              {recentTabs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDoc(d.id)}
                  className={cn(
                    "inline-flex max-w-[220px] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
                    selectedDocId === d.id
                      ? "border-primary/50 bg-primary/20 text-lavender"
                      : "border-border/70 bg-surface-2/60 text-muted hover:text-foreground",
                  )}
                >
                  {d.status === "processing" && <Loader2 className="size-3 shrink-0 animate-spin text-sky" aria-hidden />}
                  <span className="truncate">{d.name}</span>
                </button>
              ))}
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
            aria-label="Knowledge scraping logs"
            className="max-h-[260px] overflow-auto rounded-lg border border-border/80 bg-background/85 p-2.5 font-mono text-[12px] leading-relaxed"
          >
            {loading && logs.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-muted">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Waiting for scraping &amp; indexing logs...
              </p>
            ) : logs.length === 0 ? (
              <p className="py-4 text-muted">No ingestion logs recorded for this document yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {logs.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 break-words">
                    <span className="shrink-0 select-none text-[11px] text-muted/80" suppressHydrationWarning>
                      {formatLogTime(entry.createdAt)}
                    </span>
                    <LevelIcon level={entry.level} />
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0 text-[10px] font-bold uppercase",
                        stageBadgeCls[entry.stage] ?? "border-border bg-surface-2 text-muted",
                      )}
                    >
                      {entry.stage}
                    </span>
                    <span className="min-w-0 flex-1 text-foreground/90">
                      {!selectedDocId && entry.documentName && (
                        <span className="mr-1.5 font-semibold text-lavender">[{entry.documentName}]</span>
                      )}
                      {entry.message}
                      {entry.url && (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-sky underline-offset-2 hover:underline"
                        >
                          open
                          <ExternalLink className="size-2.5" aria-hidden />
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  GitBranch,
  Globe,
  Hash,
  Image as ImageIcon,
  Info,
  MessageSquare,
  RefreshCw,
  Route,
  Send,
  Sparkles,
  User,
  Workflow,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  formatCostUsd,
  formatDuration,
  providerDisplayName,
  triggerCategoryLabel,
  type ExecutionDetailDto,
  type ExecutionStepDto,
  type ExecutionStepPhase,
  type ExecutionSummaryItem,
} from "@backend/lib/execution-format";
import { formatUserDate, localeForLanguage, type UserPreferences } from "@backend/lib/preferences";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PHASE_STYLES: Record<
  ExecutionStepPhase,
  { bar: string; dot: string; badge: Tone; ring: string }
> = {
  intake: {
    bar: "bg-sky-500",
    dot: "bg-sky-500/20 text-sky border-sky-500/50",
    badge: "info",
    ring: "border-info/35",
  },
  routing: {
    bar: "bg-indigo-500",
    dot: "bg-indigo-500/20 text-lavender border-indigo-500/50",
    badge: "primary",
    ring: "border-primary/35",
  },
  retrieval: {
    bar: "bg-cyan-500",
    dot: "bg-cyan-500/20 text-accent border-cyan-500/50",
    badge: "cyan",
    ring: "border-accent/35",
  },
  model: {
    bar: "bg-violet-500",
    dot: "bg-primary/25 text-lavender border-primary/60",
    badge: "primary",
    ring: "border-lavender/45",
  },
  delivery: {
    bar: "bg-emerald-500",
    dot: "bg-success/20 text-ok border-success/50",
    badge: "success",
    ring: "border-success/35",
  },
  memory: {
    bar: "bg-amber-500",
    dot: "bg-warning/20 text-warn border-warning/45",
    badge: "warning",
    ring: "border-warning/35",
  },
  workflow: {
    bar: "bg-blue-500",
    dot: "bg-info/20 text-sky border-info/45",
    badge: "info",
    ring: "border-info/35",
  },
  error: {
    bar: "bg-red-500",
    dot: "bg-danger/20 text-bad border-danger/50",
    badge: "danger",
    ring: "border-danger/45",
  },
};

function StepPhaseIcon({ nodeType, phase }: { nodeType: string; phase: ExecutionStepPhase }) {
  if (nodeType === "telegram.received") return <MessageSquare className="size-4" />;
  if (nodeType === "command.parsed" || nodeType === "rule.matched") return <GitBranch className="size-4" />;
  if (nodeType === "telegram.download_file") return <Download className="size-4" />;
  if (nodeType === "web.search") return <Globe className="size-4" />;
  if (nodeType === "context.load" || nodeType === "knowledge.retrieve") return <BookOpen className="size-4" />;
  if (nodeType === "ai.image_generate") return <ImageIcon className="size-4" />;
  if (nodeType === "ai.vision") return <Sparkles className="size-4" />;
  if (nodeType === "ai.chat") return <Cpu className="size-4" />;
  if (nodeType.startsWith("telegram.send") || nodeType === "action.telegram.sendMessage") return <Send className="size-4" />;
  if (nodeType === "telegram.fallback_sent") return <AlertTriangle className="size-4" />;
  if (nodeType.startsWith("memory.")) return <Database className="size-4" />;
  if (phase === "workflow") return <Workflow className="size-4" />;
  return <Zap className="size-4" />;
}

function formatPreciseTime(
  iso: string | null | undefined,
  prefs: Pick<UserPreferences, "timeFormat" | "timezone" | "language">,
): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(localeForLanguage(prefs.language), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: prefs.timeFormat === "12-hour",
    timeZone: prefs.timezone,
  }).format(d);
}

function formatDateWithSeconds(
  iso: string | null | undefined,
  prefs: Pick<UserPreferences, "dateFormat" | "timeFormat" | "timezone" | "language">,
): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const datePart = formatUserDate(d, prefs);
  const timePart = new Intl.DateTimeFormat(localeForLanguage(prefs.language), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: prefs.timeFormat === "12-hour",
    timeZone: prefs.timezone,
  }).format(d);
  return `${datePart}, ${timePart}`;
}

function statusTone(status: string): Tone {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "info";
  if (status === "skipped") return "warning";
  return "neutral";
}

function extractHighlights(step: ExecutionStepDto): Array<{ label: string; value: string; mono?: boolean }> {
  const inp = step.inputSummary ?? {};
  const out = step.outputSummary ?? {};
  const chips: Array<{ label: string; value: string; mono?: boolean }> = [];

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const cmd = str(out.command) ?? str(inp.command);
  if (cmd) chips.push({ label: "Command", value: cmd, mono: true });

  const fromUser = str(inp.fromUsername) ? `@${str(inp.fromUsername)}` : str(inp.fromFirstName);
  if (fromUser) chips.push({ label: "User", value: fromUser });
  if (str(inp.chatId)) chips.push({ label: "Chat ID", value: str(inp.chatId)!, mono: true });
  if (str(inp.chatType)) chips.push({ label: "Chat", value: str(inp.chatType)! });
  if (num(inp.updateId) !== null) chips.push({ label: "Update ID", value: `#${num(inp.updateId)}`, mono: true });

  const modelUsed = str(out.modelUsed) ?? str(out.modelName) ?? str(inp.model);
  if (modelUsed) chips.push({ label: "Model", value: modelUsed, mono: true });
  const src = str(out.source) ?? str(inp.source);
  if (src) chips.push({ label: "Provider", value: providerDisplayName(src) });
  if (out.usedFallback === true) chips.push({ label: "Routing", value: "Fallback model used" });

  const totalTok = num(out.totalTokens);
  if (totalTok !== null && totalTok > 0) {
    const pTok = num(out.promptTokens) ?? 0;
    const cTok = num(out.completionTokens) ?? 0;
    chips.push({ label: "Tokens", value: `${totalTok.toLocaleString()} (${pTok.toLocaleString()} in / ${cTok.toLocaleString()} out)` });
  }
  const cost = num(out.costUsd);
  if (cost !== null && cost > 0) chips.push({ label: "Cost", value: formatCostUsd(cost) });

  if (str(out.dimensions) || str(inp.dimensions)) chips.push({ label: "Dimensions", value: (str(out.dimensions) ?? str(inp.dimensions))! });
  const bytes = num(out.bytes) ?? num(inp.bytes) ?? num(inp.imageBytes);
  if (bytes !== null && bytes > 0) chips.push({ label: "Size", value: `${Math.max(1, Math.round(bytes / 1024))} KB` });
  const mime = str(out.mimeType) ?? str(inp.mimeType);
  if (mime) chips.push({ label: "MIME", value: mime, mono: true });

  if (str(out.engine)) chips.push({ label: "Search Engine", value: str(out.engine)! });
  if (num(out.resultCount) !== null) chips.push({ label: "Web Results", value: String(num(out.resultCount)) });
  if (num(out.imageCount) !== null && num(out.imageCount)! > 0) chips.push({ label: "Images", value: String(num(out.imageCount)) });
  if (num(out.videoCount) !== null && num(out.videoCount)! > 0) chips.push({ label: "Videos", value: String(num(out.videoCount)) });

  if (num(out.kbPassages) !== null) chips.push({ label: "KB Passages", value: String(num(out.kbPassages)) });
  if (num(out.agentKnowledge) !== null) chips.push({ label: "Agent Notes", value: String(num(out.agentKnowledge)) });
  if (num(out.memoryMessages) !== null) chips.push({ label: "Memory Msgs", value: String(num(out.memoryMessages)) });

  if (num(out.deliveredCount) !== null) chips.push({ label: "Delivered", value: `${num(out.deliveredCount)} msg(s)` });
  if (num(out.queuedCount) !== null && num(out.queuedCount)! > 0) chips.push({ label: "Queued", value: `${num(out.queuedCount)} msg(s)` });
  if (num(out.messageId) !== null) chips.push({ label: "Telegram Msg ID", value: `#${num(out.messageId)}`, mono: true });
  if (Array.isArray(out.messageIds) && out.messageIds.length > 0) {
    chips.push({ label: "Telegram Msg IDs", value: out.messageIds.map((id) => `#${String(id)}`).join(", "), mono: true });
  }
  if (num(out.sentCount) !== null) chips.push({ label: "Photos Sent", value: String(num(out.sentCount)) });
  if (str(out.externalMessageId)) chips.push({ label: "External Msg ID", value: str(out.externalMessageId)!, mono: true });
  if (num(out.status) !== null) chips.push({ label: "HTTP Status", value: String(num(out.status)) });

  return chips;
}

function StepCard({
  step,
  index,
  isLast,
  totalDurationMs,
  prefs,
}: {
  step: ExecutionStepDto;
  index: number;
  isLast: boolean;
  totalDurationMs: number;
  prefs: UserPreferences;
}) {
  const [showRaw, setShowRaw] = React.useState(false);
  const style = PHASE_STYLES[step.phase] ?? PHASE_STYLES.workflow;
  const highlights = extractHighlights(step);

  const inp = step.inputSummary ?? {};
  const out = step.outputSummary ?? {};
  const promptText =
    (typeof inp.prompt === "string" && inp.prompt) ||
    (typeof inp.promptPreview === "string" && inp.promptPreview) ||
    (typeof inp.text === "string" && inp.text) ||
    (typeof inp.query === "string" && inp.query) ||
    (typeof inp.input === "string" && inp.input) ||
    null;
  const revisedPrompt = typeof out.revisedPrompt === "string" && out.revisedPrompt ? out.revisedPrompt : null;
  const outputText =
    (typeof out.replyPreview === "string" && out.replyPreview) ||
    (typeof out.outputPreview === "string" && out.outputPreview) ||
    (typeof out.caption === "string" && out.caption) ||
    null;
  const topSources = Array.isArray(out.topSources) ? out.topSources.map(String) : [];

  const denom = Math.max(totalDurationMs, 1);
  const barStartPct = step.offsetMs !== null ? Math.min(96, Math.max(0, (step.offsetMs / denom) * 100)) : 0;
  const barWidthPct = step.durationMs !== null ? Math.min(100 - barStartPct, Math.max(2, (step.durationMs / denom) * 100)) : 2;

  return (
    <li className="relative flex gap-3.5">
      {/* Vertical journey rail */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "relative z-10 grid size-9 shrink-0 place-items-center rounded-xl border font-bold shadow-sm",
            step.status === "failed" ? PHASE_STYLES.error.dot : style.dot,
          )}
        >
          <StepPhaseIcon nodeType={step.nodeType} phase={step.phase} />
          <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-surface text-[9px] font-extrabold text-foreground ring-1 ring-border">
            {index + 1}
          </span>
        </div>
        {!isLast && <div className="my-1.5 w-0.5 flex-1 rounded-full bg-gradient-to-b from-lavender/50 via-border to-border/40" />}
      </div>

      {/* Step body */}
      <div className={cn("panel mb-3.5 min-w-0 flex-1 border p-3.5 transition", step.status === "failed" ? "border-danger/50 bg-danger/5" : style.ring)}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-foreground">{step.title}</h4>
              <Badge tone={statusTone(step.status)} dot className="capitalize">
                {step.status}
              </Badge>
              <code className="rounded bg-foreground/8 px-1.5 py-0.5 text-[10px] text-muted">{step.nodeType}</code>
            </div>
            <p className="mt-0.5 text-xs text-muted">{step.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right text-xs tabular-nums">
            <span className="font-bold text-foreground">{formatDuration(step.durationMs)}</span>
            <span className="text-[11px] text-muted">
              {formatPreciseTime(step.startedAt, prefs)}
              {step.offsetMs !== null && ` · +${formatDuration(step.offsetMs)}`}
            </span>
          </div>
        </div>

        {/* Relative timing waterfall strip */}
        {totalDurationMs > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <div
                className={cn("absolute top-0 h-full rounded-full", step.status === "failed" ? "bg-danger" : style.bar)}
                style={{ left: `${barStartPct}%`, width: `${barWidthPct}%` }}
              />
            </div>
            <span className="w-10 text-right text-[10px] font-semibold tabular-nums text-muted">
              {step.durationMs !== null ? `${Math.max(1, Math.round((step.durationMs / denom) * 100))}%` : "-"}
            </span>
          </div>
        )}

        {/* Structured metadata chips */}
        {highlights.length > 0 && (
          <dl className="mt-3 flex flex-wrap gap-1.5">
            {highlights.map((h) => (
              <div key={`${h.label}-${h.value}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/80 bg-surface/75 px-2 py-1 text-[11px]">
                <dt className="font-medium text-muted">{h.label}:</dt>
                <dd className={cn("truncate font-semibold text-foreground/95", h.mono && "font-mono text-[10.5px]")}>{h.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Readable input / revised prompt / output boxes */}
        {promptText && (
          <div className="mt-2.5 rounded-lg border border-border/70 bg-surface/80 p-2.5">
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
              <span>Input / Prompt</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(promptText); toast.success("Copied input"); }}
                className="inline-flex items-center gap-1 text-lavender hover:underline"
              >
                <Copy className="size-3" />Copy
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90">{promptText}</p>
          </div>
        )}

        {revisedPrompt && (
          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/8 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-lavender">Enhanced Visual Prompt Sent to Model</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90">{revisedPrompt}</p>
          </div>
        )}

        {topSources.length > 0 && (
          <div className="mt-2 rounded-lg border border-accent/30 bg-accent/8 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Top Web Sources</p>
            <ul className="mt-1 space-y-1 text-xs text-foreground/85">
              {topSources.map((src) => (
                <li key={src} className="truncate">&bull; {src}</li>
              ))}
            </ul>
          </div>
        )}

        {outputText && (
          <div className="mt-2.5 rounded-lg border border-success/30 bg-success/8 p-2.5">
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-ok">
              <span>Output / Reply Preview</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(outputText); toast.success("Copied output"); }}
                className="inline-flex items-center gap-1 text-ok hover:underline"
              >
                <Copy className="size-3" />Copy
              </button>
            </div>
            <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-xs text-foreground/90">{outputText}</p>
          </div>
        )}

        {step.errorMessageSafe && (
          <div className="mt-2.5 rounded-lg border border-danger/45 bg-danger/12 p-2.5 text-xs text-bad">
            <p className="font-bold">{step.errorCode ?? "STEP_ERROR"}</p>
            <p className="mt-0.5 text-foreground/90">{step.errorMessageSafe}</p>
          </div>
        )}

        {(step.inputSummary || step.outputSummary) && (
          <div className="mt-2.5 border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-lavender"
            >
              {showRaw ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {showRaw ? "Hide step payload" : "Inspect step payload"}
            </button>
            {showRaw && (
              <pre className="mt-2 max-h-52 overflow-auto rounded-lg border border-border bg-background/85 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/85">
                {JSON.stringify(
                  {
                    startedAt: step.startedAt,
                    finishedAt: step.finishedAt,
                    durationMs: step.durationMs,
                    input: step.inputSummary,
                    output: step.outputSummary,
                  },
                  null,
                  2,
                )}
              </pre>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ExecutionDetailModal({
  executionId,
  initialSummary,
  onClose,
  demo = false,
}: {
  executionId: string | null;
  initialSummary?: ExecutionSummaryItem | null;
  onClose: () => void;
  demo?: boolean;
}) {
  const { prefs } = usePreferences();
  const [detail, setDetail] = React.useState<ExecutionDetailDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [innerTab, setInnerTab] = React.useState<"journey" | "models" | "raw">("journey");
  const [copiedId, setCopiedId] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  const fetchDetail = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/executions/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) {
        setError(json?.error?.message ?? "Could not load execution trace.");
        return;
      }
      setDetail(json.data as ExecutionDetailDto);
    } catch {
      setError("Network error while loading execution details.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!executionId) {
      setDetail(null);
      setError(null);
      return;
    }
    setInnerTab("journey");
    if (demo) {
      setLoading(false);
      setDetail(null);
      return;
    }
    void fetchDetail(executionId);
  }, [executionId, demo, fetchDetail]);

  React.useEffect(() => {
    if (!executionId) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [executionId, onClose]);

  if (!executionId || typeof document === "undefined") return null;

  const ex = detail?.execution;
  const displayLabel = ex?.triggerLabel ?? initialSummary?.triggerLabel ?? "Execution";
  const displayCategory = ex?.triggerCategory ?? initialSummary?.triggerCategory ?? "message";
  const displayStatus = ex?.status ?? initialSummary?.status ?? "succeeded";
  const displayBot = ex?.botName ?? initialSummary?.botName ?? "Bot";
  const displayUsername = ex?.botUsername ?? initialSummary?.botUsername;
  const totalDur = ex?.durationMs ?? initialSummary?.durationMs ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-[3px]"
        style={{ animation: "rn-fade-in 0.2s ease both" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card-glow modal-in relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden"
      >
        {/* Sticky modal header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 bg-surface/95 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <IconTile tone={displayStatus === "failed" ? "danger" : "primary"} size="lg" className="shrink-0">
              {displayStatus === "failed" ? <XCircle /> : <Route />}
            </IconTile>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="truncate font-mono text-lg font-extrabold text-foreground">
                  {displayLabel}
                </h2>
                <Badge tone="primary">{triggerCategoryLabel(displayCategory)}</Badge>
                <Badge tone={statusTone(displayStatus)} dot className="capitalize">
                  {displayStatus}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
                <span className="font-semibold text-foreground/90">{displayBot}</span>
                {displayUsername && <span className="text-lavender">@{displayUsername}</span>}
                <span>&middot;</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(executionId);
                    setCopiedId(true);
                    toast.success("Execution ID copied");
                    setTimeout(() => setCopiedId(false), 1500);
                  }}
                  className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-foreground"
                >
                  {copiedId ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
                  {executionId.slice(0, 8)}…{executionId.slice(-4)}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!demo && (
              <Button variant="outline" size="sm" onClick={() => void fetchDetail(executionId)} disabled={loading}>
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                Refresh
              </Button>
            )}
            <button
              type="button"
              aria-label="Close execution details"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg border border-border/80 bg-surface-2 text-muted transition hover:border-lavender/50 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {demo ? (
            <div className="panel p-6 text-center text-sm text-muted">
              Connect Supabase to inspect live step-by-step command journeys and AI model traces.
            </div>
          ) : loading && !detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
              <div className="skeleton h-12 rounded-xl" />
              <div className="space-y-3">
                <div className="skeleton h-28 rounded-xl" />
                <div className="skeleton h-28 rounded-xl" />
                <div className="skeleton h-28 rounded-xl" />
              </div>
            </div>
          ) : error ? (
            <div className="rn-callout p-4" data-tone="danger">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-sm">
                  <AlertTriangle className="size-5 text-bad" />
                  <span>{error}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => void fetchDetail(executionId)}>
                  Retry
                </Button>
              </div>
            </div>
          ) : detail ? (
            <>
              {/* Quick Overview KPI Grid */}
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <div className="panel p-3">
                  <dt className="flex items-center gap-1 text-[11px] text-muted"><Clock className="size-3 text-sky" />Started</dt>
                  <dd className="mt-1 text-xs font-bold tabular-nums text-foreground">{formatDateWithSeconds(detail.execution.startedAt, prefs)}</dd>
                </div>
                <div className="panel p-3">
                  <dt className="flex items-center gap-1 text-[11px] text-muted"><CheckCircle2 className="size-3 text-ok" />Finished</dt>
                  <dd className="mt-1 text-xs font-bold tabular-nums text-foreground">{formatDateWithSeconds(detail.execution.finishedAt, prefs)}</dd>
                </div>
                <div className="panel p-3">
                  <dt className="flex items-center gap-1 text-[11px] text-muted"><Zap className="size-3 text-lavender" />Total Duration</dt>
                  <dd className="mt-1 text-sm font-extrabold tabular-nums text-foreground">{formatDuration(detail.execution.durationMs)}</dd>
                  {detail.execution.durationMs !== null && (
                    <dd className="text-[10px] tabular-nums text-muted">{detail.execution.durationMs.toLocaleString()} ms</dd>
                  )}
                </div>
                <div className="panel p-3">
                  <dt className="flex items-center gap-1 text-[11px] text-muted"><Cpu className="size-3 text-lavender" />AI Model</dt>
                  <dd className="mt-1 truncate text-xs font-bold text-foreground" title={detail.summary.modelUsed ?? "No AI call"}>
                    {detail.summary.modelSlug ?? detail.summary.modelUsed ?? "No AI call"}
                  </dd>
                  <dd className="truncate text-[10px] text-muted">{detail.summary.provider ?? "Rule / Built-in"}</dd>
                </div>
                <div className="panel p-3">
                  <dt className="flex items-center gap-1 text-[11px] text-muted"><Hash className="size-3 text-accent" />Tokens &amp; Cost</dt>
                  <dd className="mt-1 text-xs font-bold tabular-nums text-foreground">
                    {detail.summary.totalTokens > 0 ? `${detail.summary.totalTokens.toLocaleString()} tok` : "0 tok"}
                  </dd>
                  <dd className="text-[10px] tabular-nums text-muted">
                    {detail.summary.totalTokens > 0
                      ? `${detail.summary.promptTokens.toLocaleString()} in / ${detail.summary.completionTokens.toLocaleString()} out · ${formatCostUsd(detail.summary.costUsd)}`
                      : formatCostUsd(detail.summary.costUsd)}
                  </dd>
                </div>
                <div className="panel p-3">
                  <dt className="flex items-center gap-1 text-[11px] text-muted"><User className="size-3 text-sky" />Telegram User</dt>
                  <dd className="mt-1 truncate text-xs font-bold text-foreground">
                    {detail.actor.username
                      ? `@${detail.actor.username}`
                      : detail.actor.firstName
                        ? detail.actor.firstName
                        : detail.actor.chatId
                          ? `Chat ${detail.actor.chatId}`
                          : "Telegram"}
                  </dd>
                  <dd className="truncate text-[10px] capitalize text-muted">
                    {detail.actor.chatType ? `${detail.actor.chatType} chat` : detail.summary.deliveredMessages > 0 ? `${detail.summary.deliveredMessages} delivered` : "Telegram Bot API"}
                  </dd>
                </div>
              </dl>

              {/* Failure banner */}
              {detail.execution.status === "failed" && (
                <div role="alert" className="rn-callout p-3.5" data-tone="danger">
                  <div className="flex items-start gap-2.5 text-xs">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
                    <div>
                      <p className="font-bold text-bad">Execution Failed ({detail.execution.errorCode ?? "ERROR"})</p>
                      <p className="mt-0.5 text-foreground/90">{detail.execution.errorMessage ?? "An error interrupted this command execution."}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Reconstructed legacy banner */}
              {detail.traceSource === "reconstructed" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-info/35 bg-info/10 px-3.5 py-2.5 text-xs text-foreground/85">
                  <Info className="mt-0.5 size-4 shrink-0 text-sky" />
                  <p>
                    <strong>Historical Trace Reconstructed:</strong> This execution ran before granular step-by-step tracing was enabled.
                    Stages and latency below are correlated from execution timestamps and AI usage telemetry; all new commands record full per-step inputs, outputs, and Telegram delivery message IDs.
                  </p>
                </div>
              )}

              {/* Visual Phase Waterfall Breakdown */}
              {detail.phaseBreakdown.length > 0 && (
                <div className="panel p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-foreground">Execution Time Breakdown</span>
                    <span className="text-muted">
                      {detail.steps.length} stage{detail.steps.length === 1 ? "" : "s"} &middot; Total {formatDuration(detail.execution.durationMs)}
                    </span>
                  </div>
                  <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    {detail.phaseBreakdown.map((p) => (
                      <div
                        key={p.phase}
                        title={`${p.label}: ${formatDuration(p.durationMs)} (${p.pct}%)`}
                        className={cn("h-full transition-all", PHASE_STYLES[p.phase]?.bar ?? "bg-primary")}
                        style={{ width: `${Math.max(3, p.pct)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-3 text-[11px]">
                    {detail.phaseBreakdown.map((p) => (
                      <span key={p.phase} className="inline-flex items-center gap-1.5 text-foreground/85">
                        <span className={cn("size-2 rounded-full", PHASE_STYLES[p.phase]?.bar ?? "bg-primary")} />
                        <span className="font-medium">{p.label}</span>
                        <span className="tabular-nums text-muted">{formatDuration(p.durationMs)} ({p.pct}%)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Journey Summary Flow Pills */}
              {detail.steps.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2 text-[11px]">
                  {detail.steps.map((s, idx) => (
                    <React.Fragment key={s.id}>
                      {idx > 0 && <ArrowRight className="size-3 shrink-0 text-muted" aria-hidden />}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold",
                          s.status === "failed"
                            ? "border-danger/45 bg-danger/15 text-bad"
                            : "border-border/80 bg-surface text-foreground/90",
                        )}
                      >
                        <span className="text-muted">{idx + 1}.</span>
                        <span>{s.title}</span>
                        <span className="tabular-nums text-muted">({formatDuration(s.durationMs)})</span>
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Inner Modal Section Switcher */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 pb-2.5">
                {(
                  [
                    ["journey", `Full Journey (${detail.steps.length})`, Route],
                    ["models", `AI Model Calls (${detail.aiCalls.length})`, Cpu],
                    ["raw", "Raw Trace JSON", Code2],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setInnerTab(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      innerTab === id
                        ? "btn-primary-bg text-white"
                        : "border border-border/70 bg-surface-2/60 text-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {innerTab === "journey" ? (
                <ol className="pt-1">
                  {detail.steps.map((step, i) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      index={i}
                      isLast={i === detail.steps.length - 1}
                      totalDurationMs={totalDur}
                      prefs={prefs}
                    />
                  ))}
                </ol>
              ) : innerTab === "models" ? (
                <div className="space-y-3">
                  {detail.aiCalls.length === 0 ? (
                    <div className="panel p-6 text-center text-sm text-muted">
                      No metered AI model calls were recorded for this execution (for example, built-in commands like <code>/start</code>, <code>/help</code>, or usage prompts reply directly without calling an LLM).
                    </div>
                  ) : (
                    detail.aiCalls.map((call, idx) => (
                      <div key={call.id} className="panel space-y-2.5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="primary">Call #{idx + 1}</Badge>
                            <span className="font-mono text-sm font-bold text-foreground">{call.apiModelId ?? call.modelSlug}</span>
                            <Badge tone={call.source === "nvidia" ? "success" : "info"}>{providerDisplayName(call.source)}</Badge>
                            <Badge tone="cyan" className="uppercase">{call.kind}</Badge>
                          </div>
                          <span className="text-xs font-bold tabular-nums text-foreground">{formatDuration(call.latencyMs)}</span>
                        </div>
                        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                          <div className="rounded-lg border border-border/70 bg-surface/75 p-2">
                            <dt className="text-[10px] text-muted">Prompt Tokens</dt>
                            <dd className="font-bold tabular-nums">{call.promptTokens.toLocaleString()}</dd>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-surface/75 p-2">
                            <dt className="text-[10px] text-muted">Completion Tokens</dt>
                            <dd className="font-bold tabular-nums">{call.completionTokens.toLocaleString()}</dd>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-surface/75 p-2">
                            <dt className="text-[10px] text-muted">Total Tokens</dt>
                            <dd className="font-bold tabular-nums">{call.totalTokens.toLocaleString()}</dd>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-surface/75 p-2">
                            <dt className="text-[10px] text-muted">Estimated Cost</dt>
                            <dd className="font-bold tabular-nums">{formatCostUsd(call.costUsd)}</dd>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-surface/75 p-2">
                            <dt className="text-[10px] text-muted">Recorded At</dt>
                            <dd className="font-bold tabular-nums">{formatPreciseTime(call.createdAt, prefs)}</dd>
                          </div>
                        </dl>
                        {call.providerRequestId && (
                          <p className="font-mono text-[11px] text-muted">Provider Request ID: {call.providerRequestId}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(JSON.stringify(detail, null, 2));
                        toast.success("Full execution JSON copied");
                      }}
                    >
                      <Copy className="size-3.5" />Copy Full JSON
                    </Button>
                  </div>
                  <pre className="max-h-[420px] overflow-auto rounded-xl border border-border bg-background/90 p-4 font-mono text-[11px] leading-relaxed text-foreground/85">
                    {JSON.stringify(detail, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Sticky footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-surface/95 px-5 py-3 text-xs text-muted">
          <span>Timezone: {prefs.timezone} &middot; {prefs.timeFormat}</span>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

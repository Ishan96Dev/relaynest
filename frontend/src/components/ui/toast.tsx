"use client";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * App-wide toasts. Call `toast.success("Saved")` from anywhere in client code (event handlers, effects, async functions);
 * no provider or hook is needed. <Toaster /> is mounted once in the root layout.
 *
 *   toast.success("Bot saved");
 *   toast.error("Could not save", { description: "Check your connection." });
 *   toast.promise(save(), { loading: "Saving...", success: "Saved", error: (e) => String(e) });
 */
export type ToastKind = "success" | "error" | "warning" | "info" | "loading";

export interface ToastOptions {
  /** Pass an existing id to update that toast in place (e.g. loading to success). */
  id?: string;
  description?: string;
  /** Milliseconds before auto-dismiss. Infinity keeps it until closed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: string;
  kind: ToastKind;
  title: string;
  duration: number;
  /** Bumped on every update so timers and the progress bar restart. */
  rev: number;
  leaving?: boolean;
}

const MAX_VISIBLE = 4;
const EXIT_MS = 220;
const defaults: Record<ToastKind, number> = { success: 4000, info: 4500, warning: 6000, error: 7000, loading: Infinity };

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => items;
const EMPTY: ToastItem[] = [];
const serverSnapshot = () => EMPTY;

function push(kind: ToastKind, title: string, opts: ToastOptions = {}): string {
  const id = opts.id ?? `t${++counter}`;
  const next: ToastItem = { ...opts, id, kind, title, duration: opts.duration ?? defaults[kind], rev: 0 };
  const existing = items.find((t) => t.id === id);
  if (existing) {
    items = items.map((t) => (t.id === id ? { ...next, rev: t.rev + 1, leaving: false } : t));
  } else {
    items = [...items, next];
    // Keep the stack short: retire the oldest ones beyond the limit.
    const live = items.filter((t) => !t.leaving);
    for (const old of live.slice(0, Math.max(0, live.length - MAX_VISIBLE))) dismiss(old.id);
  }
  emit();
  return id;
}

export function dismiss(id?: string) {
  const ids = id ? [id] : items.map((t) => t.id);
  items = items.map((t) => (ids.includes(t.id) ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => { items = items.filter((t) => !ids.includes(t.id) || !t.leaving); emit(); }, EXIT_MS);
}

type Msg<T> = string | ((v: T) => string);
const resolveMsg = <T,>(m: Msg<T>, v: T) => (typeof m === "function" ? m(v) : m);

export const toast = Object.assign(
  (title: string, opts?: ToastOptions) => push("info", title, opts),
  {
    success: (title: string, opts?: ToastOptions) => push("success", title, opts),
    error: (title: string, opts?: ToastOptions) => push("error", title, opts),
    warning: (title: string, opts?: ToastOptions) => push("warning", title, opts),
    info: (title: string, opts?: ToastOptions) => push("info", title, opts),
    loading: (title: string, opts?: ToastOptions) => push("loading", title, opts),
    dismiss,
    /** Shows a loading toast, then turns it into a success or error toast when the promise settles. */
    promise<T>(p: Promise<T>, m: { loading: string; success: Msg<T>; error: Msg<unknown> }): Promise<T> {
      const id = push("loading", m.loading);
      p.then((v) => push("success", resolveMsg(m.success, v), { id }), (e) => push("error", resolveMsg(m.error, e), { id }));
      return p;
    },
  },
);

const icons: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="size-5 text-ok" aria-hidden />,
  error: <XCircle className="size-5 text-bad" aria-hidden />,
  warning: <AlertTriangle className="size-5 text-warn" aria-hidden />,
  info: <Info className="size-5 text-info" aria-hidden />,
  loading: <Loader2 className="size-5 animate-spin text-lavender" aria-hidden />,
};

function ToastCard({ t }: { t: ToastItem }) {
  const [paused, setPaused] = React.useState(false);
  const remaining = React.useRef(t.duration);
  const startedAt = React.useRef(0);
  React.useEffect(() => { remaining.current = t.duration; }, [t.rev, t.duration]);
  // The timer pauses while the pointer is over the toast or focus is inside it, and resumes with the time that was left.
  React.useEffect(() => {
    if (!Number.isFinite(t.duration) || paused || t.leaving) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismiss(t.id), Math.max(0, remaining.current));
    return () => { clearTimeout(timer); remaining.current -= Date.now() - startedAt.current; };
  }, [paused, t.duration, t.leaving, t.id, t.rev]);

  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      data-kind={t.kind}
      data-leaving={t.leaving ? "true" : "false"}
      className="toast"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{t.title}</p>
        {t.description && <p className="mt-0.5 text-xs leading-snug text-foreground/75">{t.description}</p>}
        {t.action && (
          <button type="button" className="mt-1.5 text-xs font-bold text-lavender underline-offset-2 hover:underline" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>
            {t.action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Dismiss notification" title="Dismiss" onClick={() => dismiss(t.id)} className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-foreground/10 hover:text-foreground">
        <X className="size-4" aria-hidden />
      </button>
      {Number.isFinite(t.duration) && (
        <span key={t.rev} className={cn("toast-bar", paused && "toast-bar-paused")} style={{ animationDuration: `${t.duration}ms` }} aria-hidden />
      )}
    </div>
  );
}

export function Toaster() {
  const list = React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted || list.length === 0) return null;
  return createPortal(
    <div className="toast-viewport" aria-label="Notifications" role="region">
      {list.map((t) => <ToastCard key={t.id} t={t} />)}
    </div>,
    document.body,
  );
}

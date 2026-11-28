"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Accessible modal dialog: Esc and backdrop close it, focus moves inside, page scroll is locked. */
export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input, button:not([data-close]), [href]")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]")];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; prev?.focus(); };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] grid grid-cols-1 place-items-center overflow-y-auto p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px]" style={{ animation: "rn-fade-in 0.25s ease both" }} onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "card-glow modal-in relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden p-5 sm:max-h-[calc(100dvh-2rem)] sm:p-6",
          className,
        )}
      >
        <div className="flex shrink-0 items-start gap-3">
          {icon}
          <h2 id={titleId} className="flex-1 pt-1 text-lg font-bold">{title}</h2>
          <button data-close aria-label="Close" onClick={onClose} className="rounded-md p-1 text-muted transition hover:bg-foreground/10 hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className={cn("mt-2 min-h-0 flex-1 overflow-y-auto text-sm text-foreground/80", bodyClassName)}>{children}</div>
        {footer && <div className="mt-6 grid shrink-0 grid-cols-2 gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
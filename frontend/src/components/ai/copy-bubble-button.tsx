"use client";
import { Check, Copy } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Copies text to clipboard with a graceful legacy fallback for non-HTTPS local origins. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback below.
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Tactile, accessible copy button designed to sit cleanly inside chat query and response bubbles.
 */
export function CopyBubbleButton({
  text,
  tone = "assistant",
  label = "Copy message",
  showLabel = false,
  className,
}: {
  text: string;
  tone?: "user" | "assistant";
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  async function onCopy(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={(e) => void onCopy(e)}
      aria-label={copied ? "Copied to clipboard" : label}
      title={copied ? "Copied!" : label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md text-[11px] font-semibold transition focus-visible:outline-2",
        showLabel ? "px-2 py-0.5" : "p-1",
        tone === "user"
          ? "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
          : "border border-border/70 bg-surface/75 text-muted hover:border-lavender/50 hover:bg-primary/10 hover:text-foreground",
        copied && (tone === "user" ? "bg-white/25 text-white" : "border-success/50 bg-success/10 text-ok"),
        className,
      )}
    >
      {copied ? <Check className="size-3.5 shrink-0" aria-hidden /> : <Copy className="size-3.5 shrink-0" aria-hidden />}
      {showLabel && <span>{copied ? "Copied" : "Copy"}</span>}
    </button>
  );
}

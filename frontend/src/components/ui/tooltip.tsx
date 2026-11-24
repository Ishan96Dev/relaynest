import { Info } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type TooltipSide = "top" | "bottom" | "left" | "right";

/**
 * Wraps any trigger and gives it a tooltip. The bubble itself is drawn by <TooltipLayer /> (mounted once in the root layout),
 * so it is never clipped by overflow containers, flips near screen edges, and works on disabled controls
 * because this wrapper receives the hover.
 *
 * You rarely need this directly: `title` on a Button, `aria-label` on an icon-only button/link, and any element
 * with a `title` or `data-tip` attribute are picked up by the layer automatically.
 */
export function Tooltip({
  content,
  side = "top",
  className,
  children,
}: {
  content?: string;
  side?: TooltipSide;
  className?: string;
  children: React.ReactNode;
}) {
  if (!content) return <>{children}</>;
  return (
    <span className={cn("tip", className)} data-tip={content} data-side={side}>
      {children}
    </span>
  );
}

/** The little "i" icon: hoverable and keyboard focusable, with its explanation shown as a tooltip. */
export function InfoTip({ content, side, className }: { content: string; side?: TooltipSide; className?: string }) {
  return (
    <button
      type="button"
      data-tip={content}
      data-side={side}
      aria-label={content}
      className={cn("inline-grid size-5 shrink-0 place-items-center rounded-full text-muted transition hover:text-foreground focus-visible:text-foreground", className)}
    >
      <Info className="size-4" aria-hidden />
    </button>
  );
}

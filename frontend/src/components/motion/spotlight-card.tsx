"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Card with a soft highlight that follows the pointer, plus a lift on hover. */
export function SpotlightCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onPointerMove={move}
      className={cn(
        "card lift group relative overflow-hidden",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        "before:bg-[radial-gradient(260px_circle_at_var(--mx,50%)_var(--my,50%),rgb(var(--rn-primary)/0.22),transparent_70%)]",
        className,
      )}
    >
      <div className="relative">{children}</div>
    </div>
  );
}
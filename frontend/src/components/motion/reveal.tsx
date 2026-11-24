"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Fades/slides content in when it scrolls into view (once). Content stays visible without JS. */
export function Reveal({
  as: Tag = "div",
  variant = "up",
  delay = 0,
  className,
  children,
  ...rest
}: {
  as?: React.ElementType;
  variant?: "up" | "left" | "right" | "zoom" | "draw";
  delay?: number;
  className?: string;
  children?: React.ReactNode;
} & Record<string, unknown>) {
  const ref = React.useRef<HTMLElement>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => { if (e?.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className={cn(variant === "draw" ? "draw-line" : "reveal", variant === "left" && "reveal-left", variant === "right" && "reveal-right", variant === "zoom" && "reveal-zoom", shown && "in", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
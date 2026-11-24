"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Paragraph whose words light up one by one as it scrolls through the viewport (scroll-scrubbed).
 * Words listed in `accent` use the rainbow gradient once lit.
 */
export function ScrollFillText({ text, accent = [], className }: { text: string; accent?: string[]; className?: string }) {
  const wrap = React.useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  React.useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const spans = [...el.querySelectorAll<HTMLElement>("[data-w]")];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      const lit = p * spans.length;
      spans.forEach((s, i) => { s.style.opacity = String(0.22 + 0.78 * Math.min(1, Math.max(0, lit - i))); });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);

  return (
    <p ref={wrap} aria-label={text} className={cn(className)}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span data-w aria-hidden className={cn("scrub-word", accent.includes(w.replace(/[.,]/g, "")) && "rainbow-text")} style={{ opacity: 0.22 }}>{w}</span>
          {i < words.length - 1 && " "}
        </React.Fragment>
      ))}
    </p>
  );
}
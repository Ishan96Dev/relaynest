"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Shrinks its content with CSS zoom when the available height is smaller than the content,
 * so auth pages never need to scroll. Never enlarges past 1.
 */
export function FitToHeight({ children, className }: { children: React.ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      i.style.zoom = "1";
      const avail = o.clientHeight - 16;
      const need = i.offsetHeight;
      const z = need > avail && avail > 0 ? Math.max(0.5, avail / need) : 1;
      i.style.zoom = String(Math.round(z * 1000) / 1000);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    const mo = new MutationObserver(fit);
    mo.observe(i, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);

  return (
    <div ref={outer} className={className}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

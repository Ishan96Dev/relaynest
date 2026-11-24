"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pointer-driven 3D tilt with a light glare. Children with the `tilt-layer` class pop out of the plane
 * (set --z per child). Disabled on touch devices and with reduced motion.
 */
export function Tilt({ max = 8, className, children }: { max?: number; className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const raf = React.useRef(0);

  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-py * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * max).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
      el.classList.add("is-active");
    });
  };
  const leave = () => {
    cancelAnimationFrame(raf.current);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.classList.remove("is-active");
  };

  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={cn("tilt relative", className)}>
      {children}
      <span className="tilt-glare" aria-hidden />
    </div>
  );
}
"use client";

import * as React from "react";

/** Animates the first number found in `value` (e.g. "12,430", "+38%") from 0 when it scrolls into view. */
export function CountUp({ value, duration = 1100 }: { value: string; duration?: number }) {
  const m = /(\d[\d,]*)(\.\d+)?/.exec(value);
  const ref = React.useRef<HTMLSpanElement>(null);
  const [text, setText] = React.useState(value);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion")) return;
    const target = parseFloat(m[0].replace(/,/g, ""));
    const decimals = m[2] ? m[2].length - 1 : 0;
    const [before, after] = [value.slice(0, m.index), value.slice(m.index + m[0].length)];
    let frame = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        const n = target * eased;
        setText(before + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + after);
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      setText(before + (0).toLocaleString("en-US", { minimumFractionDigits: decimals }) + after);
      frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span ref={ref} className="tabular-nums" aria-label={value}>{text}</span>;
}
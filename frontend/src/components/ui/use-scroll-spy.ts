"use client";

import * as React from "react";

/**
 * Reliable scroll-spy hook driven by requestAnimationFrame geometry across scroll & resize events.
 * Works cleanly regardless of section height (short or very tall 2000px+ documentation blocks).
 */
export function useScrollSpy(
  ids: string[],
  opts?: { initialId?: string; topOffset?: number },
): [string, React.Dispatch<React.SetStateAction<string>>] {
  const [activeId, setActiveId] = React.useState<string>(opts?.initialId ?? ids[0] ?? "");
  const idsKey = ids.join("|");
  const offset = opts?.topOffset ?? 200;

  React.useEffect(() => {
    const list = idsKey ? idsKey.split("|") : [];
    if (list.length === 0) return;

    let rafId = 0;

    const computeActive = () => {
      rafId = 0;
      const elements = list
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => Boolean(el));
      if (elements.length === 0) return;

      const docEl = document.documentElement;
      const atTop = window.scrollY <= 80;
      const atBottom = window.innerHeight + window.scrollY >= docEl.scrollHeight - 40;

      let nextId = list[0]!;
      if (atBottom) {
        nextId = elements[elements.length - 1]!.id;
      } else if (!atTop) {
        for (const el of elements) {
          if (el.getBoundingClientRect().top <= offset) {
            nextId = el.id;
          } else {
            break;
          }
        }
      }

      setActiveId((prev) => (prev === nextId ? prev : nextId));
    };

    const scheduleCompute = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(computeActive);
    };

    computeActive();
    window.addEventListener("scroll", scheduleCompute, { passive: true });
    document.addEventListener("scroll", scheduleCompute, { passive: true, capture: true });
    window.addEventListener("resize", scheduleCompute, { passive: true });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleCompute) : null;
    if (ro) ro.observe(document.body);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleCompute);
      document.removeEventListener("scroll", scheduleCompute, { capture: true });
      window.removeEventListener("resize", scheduleCompute);
      ro?.disconnect();
    };
  }, [idsKey, offset]);

  return [activeId, setActiveId];
}

/** Smoothly center a sticky TOC link inside its own scrollable container without affecting window scroll. */
export function centerElementInContainer(container: HTMLElement | null, element: HTMLElement | null) {
  if (!container || !element) return;
  const cRect = container.getBoundingClientRect();
  const eRect = element.getBoundingClientRect();
  const relTop = eRect.top - cRect.top + container.scrollTop;
  const targetTop = relTop - container.clientHeight / 2 + eRect.height / 2;
  container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
}

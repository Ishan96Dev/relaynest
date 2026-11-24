"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import type { TooltipSide } from "./tooltip";

/**
 * One tooltip for the whole app, driven by event delegation. It shows for:
 *  - any element with `data-tip` (and optional `data-side`),
 *  - any element with a native `title` (taken over so the browser's plain tooltip never shows),
 *  - icon-only buttons and links that only have an `aria-label`.
 * Hover shows it after a short delay, keyboard focus shows it immediately. Touch devices do not get hover tooltips.
 */
const GAP = 10;
const MARGIN = 8;
const SHOW_DELAY = 350;
const WARM_MS = 700;
const ID = "rn-tooltip";

interface Target { el: HTMLElement; text: string; side: TooltipSide }
interface Placed { side: TooltipSide; top: number; left: number; arrow: number }

const isIconOnly = (el: HTMLElement) => !el.textContent?.trim();

function resolve(start: EventTarget | null): Target | null {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      const title = el.getAttribute("title")?.trim();
      if (title) {
        // Take over the native tooltip, but keep an accessible name for icon-only controls.
        el.dataset.tip = title;
        el.removeAttribute("title");
        if (!el.hasAttribute("aria-label") && isIconOnly(el)) el.setAttribute("aria-label", title);
      }
      const tip = el.dataset.tip;
      if (tip) return { el, text: tip, side: (el.dataset.side as TooltipSide) || "top" };
      const label = el.getAttribute("aria-label")?.trim();
      const interactive = el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button";
      if (label && interactive && isIconOnly(el)) return { el, text: label, side: "top" };
    }
    el = el.parentElement;
  }
  return null;
}

function place(target: HTMLElement, bubble: HTMLElement, wanted: TooltipSide): Placed {
  const r = target.getBoundingClientRect();
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const room = { top: r.top, bottom: vh - r.bottom, left: r.left, right: vw - r.right };
  const need = wanted === "top" || wanted === "bottom" ? bh + GAP + MARGIN : bw + GAP + MARGIN;
  const opposite: Record<TooltipSide, TooltipSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  let side = wanted;
  if (room[wanted] < need && room[opposite[wanted]] > room[wanted]) side = opposite[wanted];
  let top: number, left: number, arrow: number;
  if (side === "top" || side === "bottom") {
    left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - bw / 2), vw - bw - MARGIN);
    top = side === "top" ? r.top - bh - GAP : r.bottom + GAP;
    arrow = Math.min(Math.max(12, r.left + r.width / 2 - left), bw - 12);
  } else {
    top = Math.min(Math.max(MARGIN, r.top + r.height / 2 - bh / 2), vh - bh - MARGIN);
    left = side === "left" ? r.left - bw - GAP : r.right + GAP;
    arrow = Math.min(Math.max(12, r.top + r.height / 2 - top), bh - 12);
  }
  return { side, top, left, arrow };
}

export function TooltipLayer() {
  const [target, setTarget] = React.useState<Target | null>(null);
  const [placed, setPlaced] = React.useState<Placed | null>(null);
  const bubbleRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let lastHidden = 0;
    const hide = () => {
      clearTimeout(timer);
      if (current) { current.removeAttribute("aria-describedby"); lastHidden = Date.now(); }
      current = null;
      setTarget(null); setPlaced(null);
    };
    const show = (t: Target, delay: number) => {
      if (current === t.el) return;
      hide();
      const run = () => {
        if (!t.el.isConnected) return;
        current = t.el;
        t.el.setAttribute("aria-describedby", ID);
        setTarget(t);
      };
      // Moving between neighbouring controls feels better with no delay once a tooltip was just visible.
      const wait = Date.now() - lastHidden < WARM_MS ? 0 : delay;
      if (wait === 0) run(); else timer = setTimeout(run, wait);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const t = resolve(e.target);
      if (!t) { hide(); return; }
      show(t, SHOW_DELAY);
    };
    const onOut = (e: PointerEvent) => {
      if (!current && !timer) return;
      const to = e.relatedTarget as Node | null;
      if (to && current?.contains(to)) return;
      hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches?.(":focus-visible")) return;
      const t = resolve(el);
      if (t) show(t, 0);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  React.useLayoutEffect(() => {
    if (!target || !bubbleRef.current) return;
    setPlaced(place(target.el, bubbleRef.current, target.side));
  }, [target]);

  if (!target) return null;
  const side = placed?.side ?? target.side;
  const style = placed
    ? ({ top: placed.top, left: placed.left, "--tip-arrow": `${placed.arrow}px` } as React.CSSProperties)
    : { top: 0, left: 0 };
  return createPortal(
    <div ref={bubbleRef} id={ID} role="tooltip" className="tip-pop" data-side={side} data-show={placed ? "true" : "false"} style={style}>
      {target.text}
      <span className="tip-arrow" aria-hidden />
    </div>,
    document.body,
  );
}

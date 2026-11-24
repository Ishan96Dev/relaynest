"use client";

import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { inputClass } from "./styles";

interface Opt { value: string; label: React.ReactNode; text: string; disabled?: boolean }

function textOf(node: React.ReactNode): string {
  return React.Children.toArray(node).map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : "")).join("");
}

function parse(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: React.ReactNode) =>
    React.Children.forEach(nodes, (n) => {
      if (!React.isValidElement(n)) return;
      const p = n.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
      if (n.type === "option") out.push({ value: p.value !== undefined ? String(p.value) : textOf(p.children), label: p.children, text: textOf(p.children), disabled: p.disabled });
      else if (n.type === "optgroup" || n.type === React.Fragment) walk(p.children);
    });
  walk(children);
  return out;
}

export interface SelectProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
  children: React.ReactNode;
}

/**
 * Accessible custom dropdown (WAI-ARIA combobox + listbox). Accepts native <option> children and a
 * native-style onChange so it can replace <select> directly. The list renders in a portal, so it is
 * never clipped by scrolling containers.
 */
export function Select({ id, name, value, defaultValue, onChange, disabled, className, placeholder = "Select...", children, ...aria }: SelectProps) {
  const options = React.useMemo(() => parse(children), [children]);
  const [inner, setInner] = React.useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number }>({ left: 0, width: 0, maxH: 260 });
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const typed = React.useRef({ s: "", t: 0 });
  const listId = React.useId();

  const place = React.useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below;
    setPos({ left: r.left, width: r.width, maxH: Math.min(280, up ? above : below), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  }, []);

  const openList = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };
  const choose = (o: Opt) => {
    if (o.disabled) return;
    if (value === undefined) setInner(o.value);
    onChange?.({ target: { value: o.value, name } });
    setOpen(false);
    btnRef.current?.focus();
  };

  React.useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false); };
    const down = (e: MouseEvent) => { if (!listRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("mousedown", down);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); document.removeEventListener("mousedown", down); };
  }, [open]);

  React.useEffect(() => {
    if (open) (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const move = (d: number) => {
    let i = active;
    for (let n = 0; n < options.length; n++) { i = (i + d + options.length) % options.length; if (!options[i]?.disabled) break; }
    setActive(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") return setOpen(false);
    if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); } return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) openList(); else move(e.key === "ArrowDown" ? 1 : -1); return; }
    if (e.key === "Home" || e.key === "End") { if (open) { e.preventDefault(); setActive(e.key === "Home" ? 0 : options.length - 1); } return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) openList(); else { const o = options[active]; if (o) choose(o); }
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      typed.current.s = now - typed.current.t > 700 ? e.key.toLowerCase() : typed.current.s + e.key.toLowerCase();
      typed.current.t = now;
      const i = options.findIndex((o) => o.text.toLowerCase().startsWith(typed.current.s));
      if (i >= 0) { if (!open) openList(); setActive(i); }
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"]}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        className={cn(inputClass, "flex items-center justify-between gap-2 pr-3 text-left", open && "border-lavender ring-2 ring-primary/30")}
      >
        <span className={cn("truncate", !selected && "text-muted/70")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180 text-lavender")} />
      </button>
      {name && <input suppressHydrationWarning type="hidden" name={name} value={current} />}
      {open && typeof document !== "undefined" && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={aria["aria-label"]}
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          className="pop-in z-[120] overflow-auto rounded-xl border border-lavender/40 bg-surface p-1.5 text-sm shadow-[0_18px_50px_-14px_rgb(var(--rn-shadow)/0.9),0_0_24px_-10px_rgb(var(--rn-primary)/0.7)]"
        >
          {options.map((o, i) => (
            <li
              key={o.value + i}
              role="option"
              aria-selected={o.value === current}
              aria-disabled={o.disabled}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors",
                i === active && "bg-primary/15",
                o.value === current ? "font-semibold text-lavender" : "text-foreground",
                o.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === current && <Check className="size-4 shrink-0" aria-hidden />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
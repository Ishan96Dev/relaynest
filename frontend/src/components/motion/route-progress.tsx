"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

/** Thin top progress bar that starts when an internal link is clicked and finishes when the route changes. */
export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const guard = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    clearTimeout(guard.current);
    const t = setTimeout(() => setState("idle"), 700);
    return () => clearTimeout(t);
  }, [pathname]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setState("loading");
      clearTimeout(guard.current);
      guard.current = setTimeout(() => setState("idle"), 10_000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (state === "idle") return null;
  return <div role="progressbar" aria-label="Loading page" className={state === "done" ? "nav-progress done" : "nav-progress"} />;
}
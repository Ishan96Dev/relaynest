"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { createClient } from "@backend/lib/supabase/lazy";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Tracks user movements inside RelayNest (route navigation + inactivity session timeout)
 * and stores them in `user_audit_logs` for the platform Admin Audit Trail.
 */
export function AuditTracker({ demo }: { demo: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const lastPath = React.useRef<string>("");

  React.useEffect(() => {
    if (demo || !pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;
    void fetch("/api/v1/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "page.view", pagePath: pathname, detail: `Visited ${pathname}` }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname, demo]);

  React.useEffect(() => {
    if (demo) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await fetch("/api/v1/audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event: "session.timeout", pagePath: window.location.pathname, detail: "Idle for 30 minutes" }),
          keepalive: true,
        }).catch(() => undefined);
        try { await (await createClient()).auth.signOut(); } catch { /* ignore */ }
        router.replace("/login");
      }, IDLE_TIMEOUT_MS);
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [demo, router]);

  return null;
}

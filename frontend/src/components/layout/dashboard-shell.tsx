"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import type { SessionUser } from "@backend/server/services/session";
import { LEGAL_STRIP_LINKS } from "@/components/marketing/legal-shell";
import { RouteProgress } from "@/components/motion/route-progress";
import { APP_VERSION_TAG } from "@/lib/app-version";
import { AuditTracker } from "./audit-tracker";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

/** Shared sticky footer for authenticated workspace and admin portal shells. */
export function AppFooter() {
  return (
    <footer className="sticky bottom-0 z-20 shrink-0 border-t border-border/70 bg-background/95 px-4 py-2 text-xs text-muted backdrop-blur-md lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground/90">RelayNest {APP_VERSION_TAG}</span>
          <span aria-hidden className="text-border">|</span>
          <Link href="/docs" className="transition hover:text-lavender">Documentation</Link>
        </div>

        <span className="flex items-center gap-1.5 font-medium text-foreground/85">
          <span className="pulse-dot size-1.5 rounded-full bg-success" aria-hidden />
          All systems operational
        </span>
      </div>

      <nav aria-label="Legal and support navigation" className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border/40 pt-1.5 text-[11px] text-foreground/75">
        <span className="font-semibold text-lavender">Help &amp; Policies:</span>
        {LEGAL_STRIP_LINKS.map((item, idx) => (
          <span key={item.href} className="inline-flex items-center gap-2.5">
            {idx > 0 && <span aria-hidden className="text-border">|</span>}
            <Link href={item.href} className="transition hover:text-lavender hover:underline">
              {item.label}
            </Link>
          </span>
        ))}
      </nav>
    </footer>
  );
}

/** One shell for every authenticated page, including Settings, so navigation and spacing stay identical. */
export function DashboardShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const [open, setOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => { try { setCollapsed(localStorage.getItem("rn-sidebar") === "collapsed"); } catch { /* ignore */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("rn-sidebar", c ? "open" : "collapsed"); } catch { /* ignore */ } return !c; });
  React.useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--sb)_minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-300 lg:ease-out" style={{ "--sb": collapsed ? "84px" : "264px" } as React.CSSProperties}>
      <RouteProgress />
      <AuditTracker demo={user.demo} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen lg:block" aria-label="Sidebar"><Sidebar collapsed={collapsed} planId={user.planId} onToggle={toggle} /></aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/70" style={{ animation: "rn-fade-in 0.25s ease both" }} onClick={() => setOpen(false)} />
          <div className="relative h-full w-[84vw] max-w-[310px]" style={{ animation: "rn-slide-in-left 0.35s var(--ease-out-expo) both" }}>
            <Sidebar planId={user.planId} onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-h-screen min-w-0 flex-col">
        <Header onMenu={() => setOpen(true)} user={user} />
        {user.demo && (
          <div role="status" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs text-warn lg:px-8">
            Demo mode: Supabase is not configured, so sample data is shown and nothing is saved. See .env.example.
          </div>
        )}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}
"use client";

import {
  Activity, ChevronLeft, ChevronRight, Home, KeyRound, LogOut, Menu, Server,
  ShieldAlert, ShieldCheck, Terminal, Users, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { AppFooter } from "@/components/layout/dashboard-shell";
import { RouteProgress } from "@/components/motion/route-progress";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AdminNavItem {
  section: "Overview" | "Governance" | "Infrastructure" | "Observability";
  href: string;
  label: string;
  icon: typeof Activity;
  exact?: boolean;
}

const ADMIN_NAV: AdminNavItem[] = [
  { section: "Overview", href: "/admin", label: "Admin Overview", icon: Home, exact: true },
  { section: "Governance", href: "/admin/audit", label: "Audit Trail", icon: Activity },
  { section: "Governance", href: "/admin/users", label: "User Records", icon: Users },
  { section: "Infrastructure", href: "/admin/services", label: "Services", icon: Server },
  { section: "Infrastructure", href: "/admin/keys", label: "Keys & Tokens", icon: KeyRound },
  { section: "Observability", href: "/admin/logs", label: "Console Logs", icon: Terminal },
  { section: "Observability", href: "/admin/security", label: "Security & Warnings", icon: ShieldAlert },
];

const SECTIONS: AdminNavItem["section"][] = ["Overview", "Governance", "Infrastructure", "Observability"];

const rowCls =
  "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-200";

function AdminSidebar({
  collapsed = false,
  onToggle,
  onNavigate,
  onClose,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      <div className={cn("flex shrink-0 items-center px-4 pt-5 pb-4", collapsed ? "justify-center px-2" : "justify-between")}>
        {!collapsed ? <Logo href="/admin" size={32} /> : <Logo href="/admin" iconOnly size={32} />}
        {onToggle && !collapsed && (
          <Tooltip content="Collapse sidebar" side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="hidden size-8 place-items-center rounded-lg border border-border/80 bg-surface-2/60 text-muted transition hover:border-lavender/50 hover:text-foreground lg:grid"
            >
              <ChevronLeft className="size-4" />
            </button>
          </Tooltip>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid size-8 place-items-center rounded-lg text-muted hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {onToggle && collapsed && (
        <div className="mb-2 flex justify-center">
          <Tooltip content="Expand sidebar" side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              className="grid size-8 place-items-center rounded-lg border border-border/80 bg-surface-2/60 text-muted transition hover:border-lavender/50 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </Tooltip>
        </div>
      )}

      {!collapsed && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-lavender/35 bg-primary/10 px-3 py-2 text-xs font-bold text-lavender">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          <span>Platform Admin Portal</span>
        </div>
      )}

      <nav aria-label="Admin sidebar navigation" className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {SECTIONS.map((sec) => {
          const items = ADMIN_NAV.filter((n) => n.section === sec);
          return (
            <div key={sec}>
              {collapsed ? (
                <div className="my-2 border-t border-border/70" aria-hidden />
              ) : (
                <p className="mb-0.5 mt-3 px-3 text-xs font-semibold text-muted first:mt-0">{sec}</p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Tooltip key={item.href} content={collapsed ? item.label : undefined} side="right" className="flex w-full">
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        className={cn(
                          rowCls,
                          "w-full",
                          collapsed && "justify-center px-0",
                          active
                            ? "btn-primary-bg text-white"
                            : "text-foreground/80 hover:translate-x-0.5 hover:bg-primary/10 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-[19px] shrink-0" aria-hidden />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      </Link>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="shrink-0 p-3">
          <div className="card-glow p-4">
            <ShieldCheck className="mb-2 size-6 text-lavender" aria-hidden />
            <p className="text-sm font-extrabold">Zero-Trust Admin Mode</p>
            <p className="mt-1 text-xs leading-snug text-muted">
              Return cleanly to your normal user workspace anytime.
            </p>
            <Link
              href="/dashboard"
              className="btn-primary-bg sheen mt-3 flex h-9 items-center justify-center rounded-lg text-xs font-semibold text-white transition hover:brightness-110"
            >
              Open User Dashboard &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminShell({ adminEmail, children }: { adminEmail: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("rn-admin-sb") === "collapsed");
    } catch { /* ignore */ }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("rn-admin-sb", c ? "open" : "collapsed");
      } catch { /* ignore */ }
      return !c;
    });

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  const activeNav =
    ADMIN_NAV.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href))) ?? ADMIN_NAV[0]!;

  return (
    <div
      className="min-h-screen lg:grid lg:grid-cols-[var(--sb)_minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-300"
      style={{ "--sb": collapsed ? "84px" : "264px" } as React.CSSProperties}
    >
      <RouteProgress />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen lg:block" aria-label="Admin sidebar">
        <AdminSidebar collapsed={collapsed} onToggle={toggle} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative h-full w-[84vw] max-w-[300px]">
            <AdminSidebar onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open admin menu"
              className="grid size-9 place-items-center rounded-lg border border-border text-muted hover:text-foreground lg:hidden"
            >
              <Menu className="size-4" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
              <Link href="/admin" className="font-semibold text-muted hover:text-foreground">Admin</Link>
              <span aria-hidden className="text-muted">/</span>
              <span className="font-bold text-lavender">{activeNav.label}</span>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-border/80 bg-surface-2 px-3 py-1 text-xs font-medium text-muted sm:inline">
              {adminEmail}
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-3.5" aria-hidden /> Log out
            </Button>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <AppFooter />
      </div>
    </div>
  );
}

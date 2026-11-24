"use client";
/* Storage images are small, pre-resized user uploads served from the Supabase CDN, so next/image optimization adds nothing. */
/* eslint-disable @next/next/no-img-element */

import { BookOpen, ChevronDown, ChevronRight, Home, LogOut, Menu, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import type { SessionUser } from "@backend/server/services/session";
import { AuthTransition } from "@/components/auth/auth-transition";
import { Tooltip } from "@/components/ui/tooltip";
import { initialsOf } from "@/lib/initials";
import { HeaderSearch } from "./header-search";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";

const labels: Record<string, string> = {
  dashboard: "Overview", bots: "My Bots", templates: "Bot Templates", new: "Create Bot",
  agents: "Automations", workflows: "Workflow", analytics: "Analytics", integrations: "Integrations", "api-docs": "API & Swagger",
  settings: "Settings", profile: "Profile", workspace: "Workspace", security: "Security & Access",
  notifications: "Notifications", "api-keys": "API Keys", billing: "Billing & Subscription", preferences: "Preferences",
  "knowledge-base": "Knowledge Base", ai: "AI Features", models: "Model Catalog", playground: "Playground", executions: "Execution History",
};

export function Header({ onMenu, user }: { onMenu: () => void; user: Pick<SessionUser, "name" | "initials" | "avatarUrl" | "plan" | "demo"> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setMenu(false);
    setSigningOut(true);
    try {
      await fetch("/auth/signout", { method: "POST", headers: { accept: "application/json" } });
    } catch { /* ignore */ }
    setTimeout(() => {
      router.replace("/login");
    }, 1050);
  }
  const segments = pathname.split("/").filter(Boolean);
  /** Dynamic ids (bot, workflow) are not human readable, so show a generic label instead. */
  const labelFor = (s: string, i: number) => {
    if (s === "ai") return segments[i + 1] === "models" || segments[i + 1] === "playground" ? "AI Models" : "AI Agents";
    if (s === "agents" && segments[i - 1] === "ai") return "Agents";
    if (segments[i - 1] === "agents" && segments[i - 2] === "ai") return "Configure";
    return labels[s] ?? (segments[i - 1] === "bots" ? "Configuration" : segments[i - 1] === "workflows" ? "Editor" : s);
  };
  const [menu, setMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);
  React.useEffect(() => setMenu(false), [pathname]);

  return (
    <>
      {signingOut && <AuthTransition mode="signout" name={user.name} />}
      <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:gap-4 lg:px-8">
      <button aria-label="Open menu" onClick={onMenu} className="grid-cols-1 grid size-10 place-items-center rounded-lg text-muted transition hover:bg-foreground/5 hover:text-foreground lg:hidden"><Menu className="size-5" /></button>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm text-muted xl:flex">
        <Link href="/dashboard" aria-label="Home" className="transition hover:text-foreground"><Home className="size-[18px]" /></Link>
        {segments.map((s, i) => (
          <React.Fragment key={s + i}>
            <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
            <span className={i === segments.length - 1 ? "truncate font-semibold text-lavender" : "truncate"}>{labelFor(s, i)}</span>
          </React.Fragment>
        ))}
      </nav>

      <HeaderSearch />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Tooltip content="Open documentation" side="bottom">
          <Link href="/docs" className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-surface-2/70 px-3.5 text-sm font-medium transition hover:-translate-y-px hover:border-lavender/60 md:flex"><BookOpen className="size-4" aria-hidden />Docs</Link>
        </Tooltip>
        <NotificationBell demo={user.demo} />
        <ThemeToggle />
        <div className="relative" ref={menuRef}>
          <button aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition hover:bg-foreground/5">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt="" width={40} height={40} className="size-10 rounded-full object-cover ring-2 ring-primary/60" />
              : user.demo
              ? <Image src="/images/illustrations/avatar.png" alt="" width={40} height={40} className="size-10 rounded-full object-cover ring-2 ring-primary/60" />
              : <span className="grid-cols-1 grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white ring-2 ring-primary/40">{user.initials || initialsOf(user.name)}</span>}
            <span className="hidden text-left leading-tight lg:block"><span className="block max-w-[140px] truncate text-sm font-bold">{user.name}</span><span className="block text-xs text-muted">{user.plan}</span></span>
            <ChevronDown className={`size-4 text-muted transition-transform duration-200 ${menu ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {menu && (
            <div role="menu" className="card pop-in absolute right-0 mt-2 w-56 overflow-hidden p-1.5 text-sm shadow-xl">
              <div className="border-b border-border/70 px-3 py-2"><p className="truncate font-bold">{user.name}</p><p className="text-xs text-muted">{user.plan}</p></div>
              <Link role="menuitem" href="/settings/profile" onClick={() => setMenu(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 transition hover:bg-primary/10"><User className="size-4" aria-hidden />Profile</Link>
              <button type="button" role="menuitem" onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-bad transition hover:bg-danger/10"><LogOut className="size-4" aria-hidden />Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
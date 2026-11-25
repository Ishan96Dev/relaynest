"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { landingPathFor } from "@backend/lib/preferences";
import { Logo } from "@/components/brand/logo";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { aiNav, mainNav, promoFor, settingsNav, type NavItem, type Promo } from "./nav";

const row = "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-200";
const on = "btn-primary-bg text-white";
const off = "text-foreground/80 hover:bg-primary/10 hover:text-foreground hover:translate-x-0.5";

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Tooltip content={collapsed ? item.label : undefined} side="right" className="flex w-full">
      <Link href={item.href} prefetch={false} aria-current={active ? "page" : undefined} aria-label={collapsed ? item.label : undefined} onClick={onNavigate} className={cn(row, "w-full", collapsed && "justify-center px-0", active ? on : off)}>
        <Icon className={cn("size-[19px] shrink-0 transition-transform duration-200 group-hover/nav:scale-110", active && "drop-shadow-[0_0_6px_rgb(255_255_255/0.5)]")} aria-hidden />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      </Link>
    </Tooltip>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 border-t border-border/70" aria-hidden />;
  return <p className="mb-0.5 mt-3 px-3 text-xs font-semibold text-muted first:mt-0">{children}</p>;
}
export function PromoCard({ promo, onNavigate }: { promo: Promo; onNavigate?: () => void }) {
  const Icon = promo.icon;
  return (
    <div className="card-glow p-4">
      <Icon className="float-slow mb-2 size-7 text-lavender drop-shadow-[0_0_10px_rgb(var(--rn-primary))]" aria-hidden />
      <p className="text-lg font-extrabold leading-tight">{promo.title}</p>
      <p className="mt-1.5 text-[13px] leading-snug text-muted">{promo.body}</p>
      {promo.cta && (
        <Link href={promo.href} prefetch={false} onClick={onNavigate} className={cn("sheen mt-3 flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition hover:brightness-110", promo.gradient ? "bg-gradient-to-r from-info to-primary" : "btn-primary-bg")}>
          {promo.cta} <span aria-hidden>&rarr;</span>
        </Link>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed = false,
  planId = "free",
  onToggle,
  onNavigate,
  onClose,
}: {
  collapsed?: boolean;
  planId?: "free" | "pro" | "business";
  onToggle?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { prefs } = usePreferences();
  const homeHref = landingPathFor(prefs.landing);
  const pathname = usePathname();
  const inSettings = pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = React.useState(inSettings);
  React.useEffect(() => { if (inSettings) setSettingsOpen(true); }, [inSettings]);
  const settingsItem = mainNav.find((i) => i.label === "Settings")!;
  const SettingsIcon = settingsItem.icon;

  const renderMain = (i: NavItem) => {
      if (i.label !== "Settings") return <NavLink key={i.label} item={i} active={i.match?.(pathname) ?? false} collapsed={collapsed} onNavigate={onNavigate} />;
      if (collapsed) return <NavLink key={i.label} item={i} active={inSettings} collapsed onNavigate={onNavigate} />;
      return (
        <div key={i.label}>
          <button
            aria-expanded={settingsOpen}
            aria-controls="settings-sub"
            onClick={() => setSettingsOpen((o) => !o)}
            className={cn(row, "w-full", inSettings ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : off)}
          >
            <SettingsIcon className="size-[19px] shrink-0 transition-transform duration-300 group-hover/nav:rotate-45" aria-hidden />
            <span className="flex-1 truncate text-left">Settings</span>
            <ChevronDown className={cn("size-4 transition-transform duration-300", settingsOpen && "rotate-180")} aria-hidden />
          </button>
          <div id="settings-sub" className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out", settingsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <ul className="min-h-0 overflow-hidden">
              <li className="ml-[21px] mt-1 space-y-0.5 border-l border-border/80 pl-3">
                {settingsNav.map((s) => {
                  const SI = s.icon;
                  const active = pathname === s.href;
                  return (
                    <Link key={s.href} href={s.href} prefetch={false} tabIndex={settingsOpen ? 0 : -1} aria-current={active ? "page" : undefined} onClick={onNavigate}
                      className={cn("group/sub flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200", active ? "bg-primary/20 text-lavender" : "text-foreground/70 hover:bg-primary/10 hover:text-foreground hover:translate-x-0.5")}>
                      <SI className="size-4 shrink-0 transition-transform duration-200 group-hover/sub:scale-110" aria-hidden />
                      <span className="truncate">{s.label}</span>
                      {active && <span className="ml-auto size-1.5 rounded-full bg-lavender shadow-[0_0_8px_rgb(var(--rn-lavender))]" aria-hidden />}
                    </Link>
                  );
                })}
              </li>
            </ul>
          </div>
        </div>
      );
  };
  return (
    <div className="flex h-full flex-col gap-3 border-r border-border/70 bg-sidebar p-4">
      <div className={cn("flex items-center pb-2", collapsed ? "justify-center" : "justify-between")}>
        {collapsed ? <Logo href={homeHref} iconOnly /> : <Logo href={homeHref} />}
        {!collapsed && (onToggle || onClose) && (
          <Tooltip content={onClose ? "Close menu" : "Collapse sidebar"} side="bottom">
            <button aria-label={onClose ? "Close menu" : "Collapse sidebar"} onClick={onClose ?? onToggle} className="grid-cols-1 grid size-8 place-items-center rounded-lg border border-border text-muted transition hover:border-lavender/60 hover:text-foreground">
              <ChevronLeft className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
      {collapsed && onToggle && (
        <Tooltip content="Expand sidebar" side="right" className="mx-auto">
          <button aria-label="Expand sidebar" onClick={onToggle} className="grid-cols-1 grid size-8 place-items-center rounded-lg border border-border text-muted transition hover:border-lavender/60 hover:text-foreground"><ChevronRight className="size-4" /></button>
        </Tooltip>
      )}

      <nav aria-label="Main" className="-mx-1 flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-1">
        <SectionLabel collapsed={collapsed}>Main</SectionLabel>
        {mainNav.filter((i) => i.section === "Main").map(renderMain)}
        <SectionLabel collapsed={collapsed}>AI Platform</SectionLabel>
        {aiNav.map((i) => <NavLink key={i.label} item={i} active={i.match?.(pathname) ?? false} collapsed={collapsed} onNavigate={onNavigate} />)}
        <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
        {mainNav.filter((i) => i.section === "Workspace").map(renderMain)}
      </nav>

      {!collapsed && <div className="hidden [@media(min-height:880px)]:block"><PromoCard promo={promoFor(pathname, planId)} onNavigate={onNavigate} /></div>}
    </div>
  );
}
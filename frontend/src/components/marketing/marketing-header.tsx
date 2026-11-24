"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRODUCT_SECTIONS = [
  ["Overview", "/"],
  ["Bot Builder", "/features#bots"],
  ["Visual Workflows", "/features#workflows"],
  ["AI & Knowledge Base", "/features#ai"],
  ["Live Analytics", "/features#analytics"],
] as const;

const RESOURCE_LINKS = [
  ["User Guides", "/guides"],
  ["API Overview", "/api-reference"],
  ["About RelayNest", "/about"],
  ["Contact Us", "/contact"],
  ["Feedback", "/feedback"],
  ["Privacy & Legal", "/privacy"],
] as const;

const DIRECT_LINKS = [
  ["Features", "/features"],
  ["Templates", "/templates"],
  ["Documentation", "/docs"],
  ["Pricing", "/pricing"],
] as const;

export function MarketingHeader() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [openDrop, setOpenDrop] = React.useState<"product" | "resources" | null>(null);
  const pathname = usePathname();
  const navRef = React.useRef<HTMLElement>(null);
  const productBtnRef = React.useRef<HTMLButtonElement>(null);
  const resourcesBtnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  React.useEffect(() => { setOpen(false); setOpenDrop(null); }, [pathname]);
  React.useEffect(() => {
    const down = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenDrop(null); };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const cur = openDrop;
        setOpenDrop(null);
        setOpen(false);
        if (cur === "product") productBtnRef.current?.focus();
        else if (cur === "resources") resourcesBtnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", esc); };
  }, [openDrop]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLUListElement>, key: "product" | "resources") {
    const items = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')];
    const idx = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpenDrop(null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpenDrop(null);
      (key === "product" ? productBtnRef : resourcesBtnRef).current?.focus();
    }
  }

  return (
    <header className={cn("sticky top-0 z-40 border-b transition-all duration-300", scrolled ? "border-border/70 bg-background/85 shadow-[0_10px_30px_-20px_rgb(var(--rn-shadow)/0.8)] backdrop-blur-md" : "border-transparent bg-transparent")}>
      <div className={cn("mx-auto flex max-w-[1280px] items-center gap-5 px-4 transition-all duration-300 sm:px-6", scrolled ? "h-16" : "h-[76px]")}>
        <Logo />
        <nav ref={navRef} aria-label="Primary navigation" className="ml-2 hidden items-center gap-1 text-[15px] font-medium text-foreground/85 md:flex">
          <div className="relative">
            <button
              ref={productBtnRef}
              type="button"
              aria-expanded={openDrop === "product"}
              aria-haspopup="menu"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setOpenDrop("product");
                  requestAnimationFrame(() => navRef.current?.querySelector<HTMLAnchorElement>('[data-drop="product"] [role="menuitem"]')?.focus());
                }
              }}
              onClick={() => setOpenDrop((cur) => (cur === "product" ? null : "product"))}
              className={cn("flex items-center gap-1 rounded-lg px-3 py-2 transition hover:bg-primary/10 hover:text-foreground", openDrop === "product" && "bg-primary/10 text-lavender")}
            >
              Product
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", openDrop === "product" && "rotate-180")} aria-hidden />
            </button>
            {openDrop === "product" && (
              <ul
                role="menu"
                data-drop="product"
                aria-label="Product sections"
                onKeyDown={(e) => onMenuKeyDown(e, "product")}
                className="card pop-in absolute left-0 mt-2 w-56 p-1.5 text-sm shadow-xl"
              >
                {PRODUCT_SECTIONS.map(([label, href]) => (
                  <li key={href} role="none">
                    <Link role="menuitem" href={href} onClick={() => setOpenDrop(null)} className="block rounded-lg px-3 py-2 transition hover:bg-primary/10 hover:text-lavender focus:bg-primary/15 focus:text-lavender">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {DIRECT_LINKS.map(([label, href]) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("group relative rounded-lg px-3 py-2 transition hover:text-foreground", active && "text-lavender")}
              >
                {label}
                <span className={cn("absolute inset-x-3 bottom-1 h-px origin-left bg-gradient-to-r from-lavender to-accent transition-transform duration-300", active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100")} aria-hidden />
              </Link>
            );
          })}

          <div className="relative">
            <button
              ref={resourcesBtnRef}
              type="button"
              aria-expanded={openDrop === "resources"}
              aria-haspopup="menu"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setOpenDrop("resources");
                  requestAnimationFrame(() => navRef.current?.querySelector<HTMLAnchorElement>('[data-drop="resources"] [role="menuitem"]')?.focus());
                }
              }}
              onClick={() => setOpenDrop((cur) => (cur === "resources" ? null : "resources"))}
              className={cn("flex items-center gap-1 rounded-lg px-3 py-2 transition hover:bg-primary/10 hover:text-foreground", openDrop === "resources" && "bg-primary/10 text-lavender")}
            >
              Company &amp; Guides
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", openDrop === "resources" && "rotate-180")} aria-hidden />
            </button>
            {openDrop === "resources" && (
              <ul
                role="menu"
                data-drop="resources"
                aria-label="Company and resources"
                onKeyDown={(e) => onMenuKeyDown(e, "resources")}
                className="card pop-in absolute right-0 mt-2 w-56 p-1.5 text-sm shadow-xl"
              >
                {RESOURCE_LINKS.map(([label, href]) => (
                  <li key={href} role="none">
                    <Link role="menuitem" href={href} onClick={() => setOpenDrop(null)} className="block rounded-lg px-3 py-2 transition hover:bg-primary/10 hover:text-lavender focus:bg-primary/15 focus:text-lavender">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/login" variant="outline" className="hidden border-lavender/50 sm:inline-flex">Login</ButtonLink>
          <ButtonLink href="/signup" className="hidden sm:inline-flex">Get Started</ButtonLink>
          <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-10 place-items-center rounded-lg border border-border md:hidden">
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div className={cn("grid overflow-hidden transition-[grid-template-rows] duration-300 md:hidden", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <nav aria-label="Mobile navigation" className="min-h-0 overflow-hidden border-t border-border/60 bg-background/95 backdrop-blur-md">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <ul className="space-y-0.5">
              {DIRECT_LINKS.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} tabIndex={open ? 0 : -1} className="block rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-primary/10">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="space-y-0.5">
              {RESOURCE_LINKS.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} tabIndex={open ? 0 : -1} className="block rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-primary/10">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border/60 p-4">
            <ButtonLink href="/login" variant="outline" tabIndex={open ? 0 : -1}>Login</ButtonLink>
            <ButtonLink href="/signup" tabIndex={open ? 0 : -1}>Get Started</ButtonLink>
          </div>
        </nav>
      </div>
    </header>
  );
}

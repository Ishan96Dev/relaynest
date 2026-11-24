import { Mail, Phone, Send } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { GITHUB_URL, GitHubIcon, LEGAL_STRIP_LINKS, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/components/marketing/legal-shell";
import { Tooltip } from "@/components/ui/tooltip";
import { APP_VERSION_TAG } from "@/lib/app-version";

export { MarketingHeader } from "./marketing-header";

export function MarketingFooter() {
  const cols = [
    ["Product", [["Overview", "/"], ["Features", "/features"], ["Templates", "/templates"], ["Pricing", "/pricing"]]],
    ["Resources", [["Documentation", "/docs"], ["Templates", "/templates"], ["API Overview", "/api-reference"], ["Guides", "/guides"]]],
    ["Company", [["About", "/about"], ["Contact", "/contact"], ["Feedback", "/feedback"]]],
    ["Legal", [["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Website Policy", "/website-policy"], ["Disclaimer", "/disclaimer"], ["Responsible AI", "/responsible-ai"], ["GIGW & Accessibility", "/compliance"]]],
  ] as const;

  return (
    <footer className="border-t border-border/60 bg-sidebar/70">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.55fr_repeat(4,1fr)]">
        <div className="space-y-4 sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="max-w-[260px] text-sm text-foreground/75">
            No-code Telegram bot builder, live two-way sync, visual workflow automation, and grounded AI platform.
          </p>

          <div className="space-y-2 pt-1 text-xs text-foreground/80">
            <p className="font-bold uppercase tracking-wider text-lavender">Help &amp; Support</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 transition hover:text-lavender">
              <Mail className="size-3.5 text-lavender" aria-hidden />
              <span>{SUPPORT_EMAIL}</span>
            </a>
            <a href={SUPPORT_PHONE_HREF} className="flex items-center gap-2 transition hover:text-lavender">
              <Phone className="size-3.5 text-lavender" aria-hidden />
              <span>{SUPPORT_PHONE}</span>
            </a>
          </div>

          <div className="pt-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-lavender">Get Social</p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-surface-2/70 px-3 py-1.5 text-xs font-semibold transition hover:border-lavender/60 hover:text-lavender"
            >
              <GitHubIcon className="size-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </div>

        {cols.map(([t, items]) => (
          <div key={t}>
            <h2 className="text-sm font-bold text-foreground">{t}</h2>
            <ul className="mt-3 space-y-2 text-sm text-foreground/75">
              {items.map(([l, h]) => (
                <li key={l}>
                  <Link href={h} className="inline-block transition hover:translate-x-0.5 hover:text-lavender">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom Legal & Support Bar */}
      <div className="border-t border-border/60 bg-surface-2/40">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-foreground/75 sm:px-6">
          <nav aria-label="Legal and support navigation" className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span>&copy; {new Date().getFullYear()} RelayNest ({APP_VERSION_TAG}). All rights reserved.</span>
            <span aria-hidden className="text-border">|</span>
            {LEGAL_STRIP_LINKS.map((item, idx) => (
              <span key={item.href} className="inline-flex items-center gap-2.5">
                {idx > 0 && <span aria-hidden className="text-border">|</span>}
                <Link href={item.href} className="transition hover:text-lavender hover:underline">
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Tooltip content="GitHub" side="top">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="RelayNest on GitHub"
                className="grid size-9 place-items-center rounded-full border border-border transition hover:-translate-y-0.5 hover:border-lavender/60 hover:text-lavender"
              >
                <GitHubIcon className="size-4" />
              </a>
            </Tooltip>
            <Tooltip content="Contact Support" side="top">
              <Link
                href="/contact"
                aria-label="Contact us"
                className="grid size-9 place-items-center rounded-full border border-border transition hover:-translate-y-0.5 hover:border-lavender/60 hover:text-lavender"
              >
                <Send className="size-4" aria-hidden />
              </Link>
            </Tooltip>
          </div>
        </div>
      </div>
    </footer>
  );
}

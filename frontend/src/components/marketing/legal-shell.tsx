import { Mail, Phone, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { LegalSidebarToc } from "@/components/marketing/legal-toc";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function GitHubIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.91c.58.11.79-.25.79-.55v-2.16c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.7 5.39-5.27 5.67.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export const SUPPORT_EMAIL = "ishanrock1234@gmail.com";
export const SUPPORT_PHONE = "+91 7021133070";
export const SUPPORT_PHONE_HREF = "tel:+917021133070";
export const GITHUB_URL = "https://github.com/Ishan96Dev/relaynest";

export const LEGAL_DOCUMENT_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms-of-use" },
  { label: "Website Policy", href: "/website-policy" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Responsible AI", href: "/responsible-ai" },
  { label: "GIGW & Accessibility", href: "/compliance" },
] as const;

export const LEGAL_STRIP_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms-of-use" },
  { label: "Website Policy", href: "/website-policy" },
  { label: "Feedback", href: "/feedback" },
  { label: "Contact Us", href: "/contact" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Responsible AI", href: "/responsible-ai" },
  { label: "GIGW & Accessibility", href: "/compliance" },
] as const;

export const APP_FOOTER_POLICY_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms-of-use" },
  { label: "Website Policy", href: "/website-policy" },
  { label: "Feedback", href: "/feedback" },
  { label: "Contact Us", href: "/contact" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Responsible AI", href: "/responsible-ai" },
] as const;

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export function LegalDocumentPage({
  badge,
  title,
  subtitle,
  updatedAt = "November 24, 2026",
  icon: Icon = ShieldCheck,
  activeHref,
  sections,
}: {
  badge: string;
  title: string;
  subtitle: string;
  updatedAt?: string;
  icon?: LucideIcon;
  activeHref: string;
  sections: LegalSection[];
}) {
  return (
    <div className="mx-auto max-w-[1160px] px-4 py-12 sm:px-6 lg:py-16">
      {/* Top Aurora Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-surface/85 p-6 shadow-[0_0_80px_-28px_rgb(var(--rn-primary))] sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-3xl">
            <Badge tone="primary" className="rounded-full px-3 py-1">
              <Icon className="size-3.5" aria-hidden /> {badge}
            </Badge>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-3 text-base leading-relaxed text-foreground/80">{subtitle}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-lavender">
              Last Updated: {updatedAt}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <ButtonLink href="/contact" variant="outline" size="sm">Contact Support</ButtonLink>
            <ButtonLink href="/feedback" size="sm">Share Feedback</ButtonLink>
          </div>
        </div>

        {/* Cross-Policy Bar */}
        <nav aria-label="Legal and compliance pages" className="mt-7 flex flex-wrap items-center gap-2 border-t border-border/60 pt-5 text-xs font-semibold">
          {LEGAL_DOCUMENT_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={activeHref === item.href ? "page" : undefined}
              className={
                activeHref === item.href
                  ? "rounded-full bg-primary px-3 py-1.5 text-white shadow-sm"
                  : "rounded-full border border-border/80 bg-surface-2/70 px-3 py-1.5 text-foreground/80 transition hover:border-lavender/60 hover:text-lavender"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content + Sidebar Summary */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <LegalSidebarToc pageTitle={title} sections={sections.map((s) => ({ id: s.id, title: s.title }))} />

          <Card className="space-y-3 p-4 text-xs">
            <p className="font-bold uppercase tracking-wider text-lavender">Help &amp; Support</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 text-foreground/85 hover:text-lavender">
              <Mail className="size-3.5 shrink-0 text-lavender" aria-hidden />
              <span className="truncate">{SUPPORT_EMAIL}</span>
            </a>
            <a href={SUPPORT_PHONE_HREF} className="flex items-center gap-2 text-foreground/85 hover:text-lavender">
              <Phone className="size-3.5 shrink-0 text-lavender" aria-hidden />
              <span>{SUPPORT_PHONE}</span>
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-foreground/85 hover:text-lavender"
            >
              <GitHubIcon className="size-3.5 shrink-0 text-lavender" />
              <span>GitHub · RelayNest</span>
            </a>
          </Card>
        </aside>

        <div className="space-y-6">
          {sections.map((s, idx) => (
            <section key={s.id} id={s.id} className="card scroll-mt-24 p-6 sm:p-7">
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                {idx + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85 sm:text-[15px]">
                {s.paragraphs.map((para) => (
                  <p key={para.slice(0, 48)}>{para}</p>
                ))}
              </div>
              {s.bullets && s.bullets.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                  {s.bullets.map((b) => (
                    <li key={b.slice(0, 48)} className="flex items-start gap-2.5">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lavender" aria-hidden />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

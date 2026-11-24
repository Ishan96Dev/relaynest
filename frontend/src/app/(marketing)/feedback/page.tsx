import type { Metadata } from "next";
import { Mail, Phone, Sparkles } from "lucide-react";
import Link from "next/link";
import { ContactFeedbackForm } from "@/components/marketing/contact-feedback-form";
import { GITHUB_URL, GitHubIcon, LEGAL_STRIP_LINKS, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/components/marketing/legal-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Share product feedback, template requests, documentation suggestions, or bug reports with the RelayNest team.",
};

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-[1160px] px-4 py-12 sm:px-6 lg:py-16">
      <div className="max-w-3xl">
        <Badge tone="primary" className="rounded-full px-3 py-1">
          <Sparkles className="size-3.5" aria-hidden /> Product Feedback
        </Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">Help Shape RelayNest</h1>
        <p className="mt-3 text-base leading-relaxed text-foreground/80">
          Every feature improvement — from two-way Telegram bot sync to interactive GIF documentation — starts with user feedback. Rate your experience or suggest what we should build next.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <ContactFeedbackForm
          kind="feedback"
          categories={["Feature Request", "Bot & Template Idea", "Documentation Clarity", "Bug Report", "UI / Experience Praise"]}
          submitLabel="Submit Feedback"
          placeholderSubject="Idea for bot analytics or workflow templates"
          placeholderMessage="Tell us what worked well or what we can make clearer and faster for your bots."
        />

        <div className="space-y-4">
          <Card className="space-y-3 p-6">
            <h2 className="text-lg font-bold">What Happens Next?</h2>
            <p className="text-sm leading-relaxed text-foreground/80">
              Your feedback goes straight into our product log alongside workspace notes so we can prioritize fixes, new bot templates, and clearer guides.
            </p>
          </Card>

          <Card className="space-y-3 p-6 text-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-lavender">Help &amp; Support Channels</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 font-semibold hover:text-lavender">
              <Mail className="size-4 text-lavender" /> {SUPPORT_EMAIL}
            </a>
            <a href={SUPPORT_PHONE_HREF} className="flex items-center gap-2 font-semibold hover:text-lavender">
              <Phone className="size-4 text-lavender" /> {SUPPORT_PHONE}
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-semibold hover:text-lavender">
              <GitHubIcon className="size-4 text-lavender" /> Follow on GitHub
            </a>
          </Card>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 border-t border-border/60 pt-6 text-xs text-muted">
        {LEGAL_STRIP_LINKS.map((item, idx) => (
          <span key={item.href} className="flex items-center gap-3">
            {idx > 0 && <span aria-hidden>|</span>}
            <Link href={item.href} className="hover:text-lavender hover:underline">{item.label}</Link>
          </span>
        ))}
      </div>
    </div>
  );
}

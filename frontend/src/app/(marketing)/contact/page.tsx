import type { Metadata } from "next";
import { Clock, Mail, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import { ContactFeedbackForm } from "@/components/marketing/contact-feedback-form";
import { GITHUB_URL, GitHubIcon, LEGAL_STRIP_LINKS, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/components/marketing/legal-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Contact RelayNest Help & Support via email, phone, GitHub, or direct support form.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:py-16">
      <div className="max-w-3xl">
        <Badge tone="primary" className="rounded-full px-3 py-1">
          <MessageSquare className="size-3.5" aria-hidden /> Help &amp; Support
        </Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">Contact RelayNest Support</h1>
        <p className="mt-3 text-base leading-relaxed text-foreground/80">
          Need help connecting your Telegram bot, troubleshooting automations, discussing Pro/Business plans, or reporting an urgent security issue? Reach out directly below.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start gap-3.5">
              <IconTile tone="primary" size="lg"><Mail /></IconTile>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Support Email</p>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block text-base font-bold text-lavender hover:underline">
                  {SUPPORT_EMAIL}
                </a>
                <p className="mt-1 text-xs text-muted">Best for account help, bot setup, billing receipts, or privacy requests.</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3.5">
              <IconTile tone="info" size="lg"><Phone /></IconTile>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Phone Support</p>
                <a href={SUPPORT_PHONE_HREF} className="mt-1 block text-base font-bold text-foreground hover:text-lavender">
                  {SUPPORT_PHONE}
                </a>
                <p className="mt-1 text-xs text-muted">Available for urgent workspace escalations &amp; onboarding assistance.</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3.5">
              <IconTile tone="neutral" size="lg"><GitHubIcon /></IconTile>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Get Social · GitHub</p>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="mt-1 block text-base font-bold text-lavender hover:underline">
                  github.com/Ishan96Dev/relaynest
                </a>
                <p className="mt-1 text-xs text-muted">Follow updates, star the repository, or inspect releases.</p>
              </div>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 text-xs text-foreground/80">
            <Clock className="size-4 shrink-0 text-lavender" aria-hidden />
            <span>Typical email response time: under 24 hours (Monday–Saturday, IST).</span>
          </Card>
        </div>

        <ContactFeedbackForm
          kind="contact"
          categories={["Bot Setup & Sync", "Billing & Subscriptions", "Account & Security", "Enterprise / Custom", "Other Inquiry"]}
          submitLabel="Send Message"
          placeholderSubject="Need assistance connecting my Telegram bot"
          placeholderMessage="Share how we can help, including your bot @username if relevant (never include your private @BotFather token)."
        />
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

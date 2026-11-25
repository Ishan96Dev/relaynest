import type { Metadata } from "next";
import { FileCheck2 } from "lucide-react";
import { LegalDocumentPage, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service & Terms of Use",
  description: "Terms governing access to RelayNest, Telegram bot automation usage, billing plans, acceptable use, and service responsibilities.",
};

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of Terms",
    paragraphs: [
      "By creating a RelayNest account, connecting a Telegram bot, or accessing any part of the platform, you agree to comply with these Terms of Use and Terms of Service, as well as our Privacy Policy, Website Policy, Disclaimer, and Responsible AI Policy.",
    ],
  },
  {
    id: "accounts-bots",
    title: "Workspace Accounts & Telegram Bots",
    paragraphs: [
      "You are responsible for safeguarding your account login credentials, workspace API keys, and the @BotFather tokens connected to RelayNest.",
    ],
    bullets: [
      "You confirm you own or have explicit permission to manage every Telegram bot token you connect.",
      "You agree to follow Telegram's Bot Developer Terms and Anti-Spam policies when operating bots built on RelayNest.",
      "If a bot is deleted or revoked inside @BotFather, RelayNest flags it as Telegram Deleted so you can remove or recreate it cleanly.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    paragraphs: [
      "You may not use RelayNest to distribute unsolicited bulk spam, malware, phishing messages, illegal content, or automated harassment, nor attempt to bypass plan quotas or probe platform infrastructure.",
    ],
  },
  {
    id: "plans-billing",
    title: "Plans, Quotas & Billing (INR)",
    paragraphs: [
      "RelayNest offers a Free starter plan along with paid Pro and Business tiers priced transparently in INR (₹), supporting monthly subscriptions, annual billing (20% savings), one-time prepaid periods, and UPI QR. USD ($) billing is coming soon.",
      "Upgrades activate immediately upon payment confirmation. Subscriptions may be cancelled anytime inside Settings -> Billing without losing remaining paid-period access.",
    ],
  },
  {
    id: "intellectual-property",
    title: "Your Content & Platform Rights",
    paragraphs: [
      "You retain 100% ownership over your Knowledge Base documents, custom bot prompts, workflow logic, and customer conversations. RelayNest retains rights in the underlying user interface, workflow engine, templates, branding, and software platform.",
    ],
  },
  {
    id: "limitation-contact",
    title: "Limitation of Liability & Support",
    paragraphs: [
      "RelayNest is provided on an 'as is' and 'as available' basis. To the fullest extent permitted by law, RelayNest is not liable for indirect damages or third-party outages including Telegram Bot API or external AI provider interruptions.",
      "For billing assistance, account inquiries, or legal notices, email ishanrock1234@gmail.com or call +91 7021133070.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDocumentPage
      badge="Legal Agreement"
      title="Terms of Service & Use"
      subtitle="The rules, responsibilities, billing terms, and acceptable use standards that govern every RelayNest workspace and Telegram automation."
      icon={FileCheck2}
      activeHref="/terms-of-use"
      sections={TERMS_SECTIONS}
    />
  );
}

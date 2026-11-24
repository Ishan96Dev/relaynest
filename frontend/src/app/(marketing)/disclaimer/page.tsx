import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { LegalDocumentPage, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Important service, Telegram API, AI accuracy, and informational disclaimers for RelayNest users.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "general-disclaimer",
    title: "General Informational Disclaimer",
    paragraphs: [
      "Information, templates, example prompts, documentation guides, and automated bot workflows provided by RelayNest are intended to accelerate bot development and general business productivity. They do not constitute legal, financial, medical, tax, or compliance advice.",
    ],
  },
  {
    id: "third-party-telegram",
    title: "Third-Party Telegram & Cloud Dependencies",
    paragraphs: [
      "RelayNest relies on official APIs operated by third parties including Telegram's Bot API, authentication services, and cloud AI model providers. While RelayNest performs active health monitoring and two-way bot synchronization, temporary external outages or Telegram rate limits may delay message delivery.",
      "Deleting or revoking a bot token inside Telegram (@BotFather) immediately invalidates live Telegram connectivity; RelayNest flags the condition cleanly and allows immediate cleanup and replacement.",
    ],
  },
  {
    id: "ai-outputs",
    title: "AI-Generated Content Notice",
    paragraphs: [
      "Responses produced by AI Agents and Model Playground are probabilistic language-model outputs. Even when grounded against uploaded Knowledge Base documents, AI responses may occasionally contain inaccuracies or outdated wording.",
      "Workspace owners are solely responsible for testing workflows in Model Playground / Test Bot mode and reviewing Knowledge Base materials prior to deploying customer-facing automations.",
    ],
  },
  {
    id: "no-guarantees",
    title: "No Warranty Beyond Written Terms",
    paragraphs: [
      "Unless explicitly agreed in a dedicated commercial SLA, RelayNest makes no guarantee of uninterrupted uptime or specific commercial outcomes resulting from bot deployment.",
      "Questions regarding this Disclaimer may be directed to ishanrock1234@gmail.com or +91 7021133070.",
    ],
  },
];

export default function DisclaimerPage() {
  return (
    <LegalDocumentPage
      badge="Important Notice"
      title="Platform Disclaimer"
      subtitle="Clear disclosures regarding third-party Telegram infrastructure, AI-generated bot replies, templates, and service availability."
      icon={AlertTriangle}
      activeHref="/disclaimer"
      sections={SECTIONS}
    />
  );
}

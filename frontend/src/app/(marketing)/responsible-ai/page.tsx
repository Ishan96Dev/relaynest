import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { LegalDocumentPage, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Responsible AI Policy",
  description: "RelayNest's commitment to safe, transparent, grounded, and ethical AI inside Telegram assistants and Model Playground.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "principles",
    title: "Core Responsible AI Principles",
    paragraphs: [
      "RelayNest designs AI Agents and Model Playground tooling around practical safety, transparency, human oversight, and user data privacy. AI should help teams answer faster without deceiving end users or acting without guardrails.",
    ],
  },
  {
    id: "grounding-accuracy",
    title: "Grounding Answers in Verified Knowledge",
    paragraphs: [
      "To minimize AI hallucinations on Telegram, RelayNest encourages linking bots directly to curated Knowledge Base collections (PDFs, Markdown docs, and verified FAQs) alongside explicit fallback responses.",
    ],
    bullets: [
      "Built-in Playground & Simulate testing let creators validate prompts before enabling live traffic.",
      "System instructions, temperature, and memory turn limits stay configurable by workspace owners at any time.",
      "Fallback messages ensure unclear questions fail gracefully or route users cleanly to human support.",
    ],
  },
  {
    id: "human-oversight",
    title: "Human-in-the-Loop Controls & Transparency",
    paragraphs: [
      "Bot creators can pause any active AI Agent in one click, inspect execution logs in real time, monitor token consumption analytics, and review Bot Lifecycle History audits.",
      "We encourage creators operating customer support bots to state clearly when users are interacting with an automated assistant and provide a path to reach a human operator.",
    ],
  },
  {
    id: "prohibited-uses",
    title: "Prohibited AI Uses",
    paragraphs: [
      "RelayNest strictly prohibits deploying AI Agents for impersonation scams, phishing, automated spam campaigns, medical diagnosis, harassment, hate speech, or generation of harmful content.",
    ],
  },
  {
    id: "report-concern",
    title: "Reporting AI Safety Issues",
    paragraphs: [
      "If you spot unsafe bot behavior or wish to discuss AI governance on RelayNest, contact our team promptly at ishanrock1234@gmail.com or +91 7021133070.",
    ],
  },
];

export default function ResponsibleAiPage() {
  return (
    <LegalDocumentPage
      badge="AI Governance"
      title="Responsible AI Policy"
      subtitle="Our standards for safe, transparent, human-supervised Telegram AI assistants powered by verified Knowledge Base sources."
      icon={Sparkles}
      activeHref="/responsible-ai"
      sections={SECTIONS}
    />
  );
}

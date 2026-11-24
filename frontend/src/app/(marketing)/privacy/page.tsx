import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LegalDocumentPage, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How RelayNest collects, encrypts, processes, and protects your account, Telegram bot tokens, Knowledge Base documents, and workspace analytics.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "information-collected",
    title: "Information We Collect",
    paragraphs: [
      "RelayNest collects only the information required to operate your Telegram bot management workspace, process automations, secure accounts, and deliver requested notifications.",
    ],
    bullets: [
      "Account details: your name, email address, workspace name, and authentication metadata (via email/password or Google OAuth).",
      "Bot credentials & metadata: Telegram bot tokens obtained from @BotFather (encrypted immediately at rest), bot handles, display descriptions, and configured commands.",
      "Knowledge Base & automation content: files (PDF, TXT, Markdown), webpage links, workflow graphs, and AI agent instructions you explicitly upload.",
      "Operational & security telemetry: bot execution logs, workspace audit trails (logins, bot creates/deletes, Telegram sync events), and billing records.",
    ],
  },
  {
    id: "encryption-tokens",
    title: "How Bot Tokens & Data Are Protected",
    paragraphs: [
      "Your @BotFather API tokens are encrypted before storage using envelope encryption and are never returned to unauthenticated clients, public routes, or browser URLs.",
      "All workspace tables enforce strict row-level isolation so team members only access data belonging to workspaces they belong to.",
    ],
  },
  {
    id: "telegram-processing",
    title: "Telegram Bot Messages & Two-Way Sync",
    paragraphs: [
      "When a Telegram user sends a command or question to your active bot, RelayNest processes only the payload required to execute your configured replies, Knowledge Base retrieval, workflows, or AI agent responses.",
      "During live Telegram synchronization or manual deletion inside RelayNest, our platform verifies connection state directly with Telegram's Bot API and cleans up webhooks, command menus, descriptions, and avatars on your behalf.",
    ],
  },
  {
    id: "cookies-storage",
    title: "Cookies, Local Preferences & Analytics",
    paragraphs: [
      "RelayNest uses essential cookies for sign-in session security and optional local browser preferences (such as Dark/Light theme, High Contrast, and Reduced Motion settings). We do not sell personal data or run third-party ad tracking networks.",
    ],
  },
  {
    id: "retention-deletion",
    title: "Data Retention & Deletion Rights",
    paragraphs: [
      "You retain ownership of every bot configuration, Knowledge Base document, and workflow in your workspace. You can delete individual bots, collections, API keys, or your entire account at any time via Settings -> Security & Access -> Danger Zone · Delete Account.",
      "Deleting your account permanently removes your owned workspaces, uploaded storage avatars/logos, Telegram bot tokens/webhooks (also cleared from Telegram), and authentication credentials, and sends a deletion confirmation email to your registered email address.",
      "When an individual bot is deleted inside an active workspace, active credentials are removed while a lightweight configuration summary remains inside Bot Lifecycle History for workspace auditing until workspace removal.",
    ],
  },
  {
    id: "privacy-contact",
    title: "Contact & Privacy Requests",
    paragraphs: [
      "To request data export, correction, deletion, or ask any privacy-related question, reach RelayNest Help & Support directly via email at ishanrock1234@gmail.com or phone at +91 7021133070.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      badge="Legal & Privacy"
      title="Privacy Policy"
      subtitle="Clear explanations of how RelayNest safeguards your account, encrypted Telegram bot tokens, uploaded Knowledge Base files, and workspace activity logs."
      icon={ShieldCheck}
      activeHref="/privacy"
      sections={SECTIONS}
    />
  );
}

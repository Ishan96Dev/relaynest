import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { LegalDocumentPage, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Website Policy",
  description: "RelayNest Website Policy covering session cookies, accessibility, acceptable site access, and browser preferences.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "scope",
    title: "Website Scope & Purpose",
    paragraphs: [
      "This Website Policy applies to RelayNest's public marketing site, interactive documentation hub, template showcase, and authenticated workspace dashboard.",
    ],
  },
  {
    id: "cookies-local-storage",
    title: "Essential Cookies & Local Preferences",
    paragraphs: [
      "We keep browser storage minimal and transparent so RelayNest remains fast and privacy-respecting.",
    ],
    bullets: [
      "Authentication cookies: secure HTTP cookies used solely to keep your logged-in workspace session active and protect against cross-site request forgery.",
      "Display preferences: local browser storage remembering Dark/Light mode, High Contrast accessibility toggles, and Reduced Motion settings.",
      "Zero third-party ad networks: RelayNest does not embed behavioral advertising trackers or sell browsing history.",
    ],
  },
  {
    id: "accessibility",
    title: "Accessibility & Readability Commitment",
    paragraphs: [
      "RelayNest is engineered with keyboard navigation, visible focus states, semantic landmarks, screen-reader labels, closed captions on product walkthrough videos, and built-in High Contrast & Reduced Motion toggles inside Settings -> Preferences.",
    ],
  },
  {
    id: "external-links",
    title: "External Services & Links",
    paragraphs: [
      "Links inside the website and emails may direct you to Telegram (t.me / @BotFather), Google sign-in, GitHub, Razorpay checkout, or public webhook endpoints you configure. Those external sites operate under their own privacy and security policies.",
    ],
  },
  {
    id: "policy-updates",
    title: "Updates & Contact",
    paragraphs: [
      "We may update this Website Policy as new features ship. Questions or accessibility feedback can be sent anytime to ishanrock1234@gmail.com or +91 7021133070.",
    ],
  },
];

export default function WebsitePolicyPage() {
  return (
    <LegalDocumentPage
      badge="Site Governance"
      title="Website Policy"
      subtitle="How RelayNest handles browser storage, session cookies, accessibility standards, and external links across the site."
      icon={Globe}
      activeHref="/website-policy"
      sections={SECTIONS}
    />
  );
}

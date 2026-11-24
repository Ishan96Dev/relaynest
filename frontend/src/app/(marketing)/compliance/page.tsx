import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LegalDocumentPage, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "GIGW, Accessibility & Security Guidelines",
  description:
    "RelayNest standards for GIGW public SaaS governance, WCAG 2.1 AA accessibility, and VA/CA application security across all current and upcoming releases.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    title: "Governance & Compliance Standard",
    paragraphs: [
      "RelayNest is engineered to meet GIGW (Guidelines for Indian Government Websites / Public SaaS Standards), WCAG 2.1 Level AA Accessibility, and continuous VA/CA (Vulnerability Assessment & Code Audit) controls.",
      "Every release undergoes automated CI/CD verification before publication so public marketing pages, authenticated dashboard screens, REST APIs, and documentation stay accessible and hardened by default.",
    ],
  },
  {
    id: "gigw-standards",
    title: "GIGW Governance & Content Transparency",
    paragraphs: [
      "Public and authenticated portals maintain clear navigation, uniform branding, transparent ownership, and immutable historical documentation.",
    ],
    bullets: [
      "Mandatory Policy Suite: Privacy Policy, Terms of Service, Terms of Use, Website Policy, Disclaimer, Responsible AI, Contact Us, Feedback, and About remain linked from both public and workspace footers.",
      "Support Channels: Direct human support email (ishanrock1234@gmail.com), phone (+91 7021133070), and public GitHub repository link appear consistently.",
      "Version Lockstep: Documentation releases track the live application version automatically while freezing previous release archives.",
    ],
  },
  {
    id: "wcag-accessibility",
    title: "WCAG 2.1 Level AA Accessibility",
    paragraphs: [
      "Every interactive component, form, navigation menu, Swagger UI explorer, video player, and fullscreen viewer is built for full keyboard and assistive-technology usability.",
    ],
    bullets: [
      "Landmarks & Skip Navigation: Semantic <header>, <nav>, <main id=\"main\">, and <footer> landmarks with keyboard-focusable Skip-to-Content links.",
      "Full Keyboard Operability: Tab/Shift+Tab focus traps inside dialogs, arrow-key navigation in dropdown menus and galleries, and Space/K/M/C/F shortcuts on media players.",
      "Visual Clarity & Contrast: High-contrast focus rings (:focus-visible), non-color-only state cues, descriptive image alt text, Dark/Light/High-Contrast themes, and reduced-motion support.",
    ],
  },
  {
    id: "va-ca-security",
    title: "VA / CA Application & API Security Controls",
    paragraphs: [
      "All web pages, API routes, webhook endpoints, and PostgreSQL tables operate under strict zero-trust isolation and cryptographic hygiene.",
    ],
    bullets: [
      "Transport & Header Hardening: Strict Content Security Policy (CSP), HSTS preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, and same-origin COOP.",
      "Supabase Row Level Security: Tenant isolation via workspace membership checks plus column-level grants ensuring hashed API keys and encrypted credentials stay strictly server-side.",
      "Hashed API Tokens & SSRF Guard: Personal/workspace API keys (rnk_live_ / rnk_test_) are stored solely via SHA-256 hashes; outbound webhooks require HTTPS and pass private-IP/metadata SSRF checks.",
    ],
  },
  {
    id: "future-development",
    title: "Continuous Enforcement for Future Developments",
    paragraphs: [
      "All new features, APIs, database migrations, and documentation pages follow the mandatory engineering specification maintained inside docs/GIGW_VACA_ACCESSIBILITY.md and gated by pnpm audit:compliance in CI/CD.",
    ],
  },
];

export default function CompliancePage() {
  return (
    <LegalDocumentPage
      badge="GIGW · WCAG 2.1 AA · VA/CA"
      title="Accessibility, GIGW & Security Standards"
      subtitle="RelayNest platform commitments for accessible design, transparent public SaaS governance, and verified code security across every release."
      icon={ShieldCheck}
      activeHref="/compliance"
      sections={SECTIONS}
    />
  );
}

import type { Metadata } from "next";
import { FileCheck2 } from "lucide-react";
import { LegalDocumentPage } from "@/components/marketing/legal-shell";
import { TERMS_SECTIONS } from "../terms/page";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "RelayNest Terms of Use covering workspaces, Telegram bots, plans, and acceptable use.",
};

export default function TermsOfUsePage() {
  return (
    <LegalDocumentPage
      badge="Terms of Use"
      title="Terms of Use"
      subtitle="Clear rules governing access to the RelayNest platform, workspace security, Telegram bot rules, and subscription plans."
      icon={FileCheck2}
      activeHref="/terms-of-use"
      sections={TERMS_SECTIONS}
    />
  );
}

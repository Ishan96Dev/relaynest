import type { Metadata } from "next";
import { TemplatesShowcase } from "@/components/marketing/templates-showcase";

export const metadata: Metadata = {
  title: "Templates",
  description: "Explore ready-to-use RelayNest Telegram bot templates for customer support, FAQs, alerts, communities, lead capture, and AI assistants.",
};

export default function TemplatesPage() {
  return <TemplatesShowcase />;
}

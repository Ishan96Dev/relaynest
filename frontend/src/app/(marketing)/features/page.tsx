import type { Metadata } from "next";
import { FeaturesShowcase } from "@/components/marketing/features-showcase";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore every feature in RelayNest: two-way Telegram bot sync, visual automation workflows, AI agents, knowledge base answers, live analytics, and flexible billing.",
};

export default function FeaturesPage() {
  return <FeaturesShowcase />;
}

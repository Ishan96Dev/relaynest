import type { Metadata } from "next";
import { DocsHub } from "@/components/marketing/docs-hub";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Step-by-step user guides for building Telegram bots, visual workflows, AI agents, Knowledge Base RAG, analytics, and Upstash setup on RelayNest.",
};

export default function DocsPage() {
  return <DocsHub />;
}

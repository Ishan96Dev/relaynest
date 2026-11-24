import type { Metadata } from "next";
import { GuidesShowcase } from "@/components/marketing/guides-showcase";

export const metadata: Metadata = {
  title: "User Guides",
  description: "Step-by-step interactive walkthroughs for creating, managing, syncing, and automating Telegram bots with RelayNest.",
};

export default function GuidesPage() {
  return <GuidesShowcase />;
}

import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { RN_COLORS } from "../components/UiPrimitives";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { SCENE_BY_ID } from "../data/subtitles";

export const AiAgentScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Knowledge Base &amp; AI Agents"
        title="Train AI Bots on Your Own Documents"
        primaryScreen="screens/knowledge-base.png"
        secondaryScreen="screens/ai-agents.png"
        switchFrame={175}
        accentShift={110}
        features={[
          {
            badge: "Knowledge Base",
            title: "Upload PDFs, Guides & FAQs",
            detail: "Add help docs, pricing sheets, or webpage links — RelayNest reads them automatically.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "AI Agents",
            title: "Verified Answers 24/7",
            detail: "Link any collection so your Telegram AI agent always shares accurate company facts.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "One-Click Publish",
            title: "Instant Telegram Launch",
            detail: "Go from uploaded guide to a helpful live Telegram assistant in minutes.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.aiAgent.captions} />
    </div>
  );
};

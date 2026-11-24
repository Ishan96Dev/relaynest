import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { RN_COLORS } from "../components/UiPrimitives";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { SCENE_BY_ID } from "../data/subtitles";

export const AiStudioScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Model Catalog &amp; Playground"
        title="Choose &amp; Test Smart AI Models Live"
        primaryScreen="screens/ai-models.png"
        secondaryScreen="screens/ai-playground.png"
        switchFrame={165}
        accentShift={70}
        features={[
          {
            badge: "Model Catalog",
            title: "Top AI Partners Built In",
            detail: "Compare fast and creative AI models from Google, NVIDIA, Meta, and Mistral.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Live Playground",
            title: "Test Conversations First",
            detail: "Tune instructions, tone, and reply style right inside your browser before going live.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "Your Brand Voice",
            title: "Friendly, Accurate Answers",
            detail: "Control how your bot greets customers and handles tricky questions.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.aiStudio.captions} />
    </div>
  );
};

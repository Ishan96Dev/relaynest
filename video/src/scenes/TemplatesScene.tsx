import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { RN_COLORS } from "../components/UiPrimitives";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { SCENE_BY_ID } from "../data/subtitles";

export const TemplatesScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Bot Templates Library"
        title="Start Faster with Ready-Made Bots"
        primaryScreen="screens/templates.png"
        accentShift={-60}
        features={[
          {
            badge: "Proven Starters",
            title: "Support, FAQ & Community",
            detail: "Launch customer support, auto-FAQ, welcome, alerts, or lead capture bots right away.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Live Preview",
            title: "Try Sample Chats First",
            detail: "Check included slash commands and sample conversations before creating your bot.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "Customizable",
            title: "Make It Yours in 1 Click",
            detail: "Every welcome message, menu button, and reply can be tailored inside the visual builder.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.templates.captions} />
    </div>
  );
};

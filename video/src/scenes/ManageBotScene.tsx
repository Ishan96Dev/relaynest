import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { RN_COLORS } from "../components/UiPrimitives";
import { SCENE_BY_ID } from "../data/subtitles";

export const ManageBotScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Manage &amp; Edit Bot Configuration"
        title="Customize Every Bot Detail &amp; Sync Live"
        primaryScreen="screens/bot-detail.png"
        secondaryScreen="screens/bot-detail-commands.png"
        switchFrame={165}
        accentShift={115}
        features={[
          {
            badge: "General & Photo",
            title: "Edit Name, Bio & Avatar",
            detail: "Update your bot's display details and profile photo — synced automatically with Telegram.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "Commands & Replies",
            title: "Slash Commands & Welcome",
            detail: "Configure custom /commands, greeting copy, keyword matches, and default fallback answers.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Test & Controls",
            title: "Safe Test Console & Sync",
            detail: "Simulate bot replies locally, verify tokens with Telegram, or check Bot Lifecycle History.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.manageBot.captions} />
    </div>
  );
};

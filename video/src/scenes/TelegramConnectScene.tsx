import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { RN_COLORS } from "../components/UiPrimitives";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { SCENE_BY_ID } from "../data/subtitles";

export const TelegramConnectScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="My Bots &amp; Setup Wizard"
        title="Connect Your Telegram Bot in Seconds"
        primaryScreen="screens/bots-new.png"
        secondaryScreen="screens/bots.png"
        switchFrame={185}
        accentShift={85}
        features={[
          {
            badge: "Step 1 · Telegram",
            title: "Guided BotFather Connect",
            detail: "Follow 4 simple steps to paste your token from Telegram's @BotFather.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Two-Way Sync",
            title: "Live Telegram Sync",
            detail: "Imports your bot photo and handle, and alerts you immediately if removed in Telegram.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "Bot History",
            title: "Created & Deleted Records",
            detail: "Logs what each bot is used for, plus cleans webhooks and commands when deleted.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.telegram.captions} />
    </div>
  );
};

import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { RN_COLORS } from "../components/UiPrimitives";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { SCENE_BY_ID } from "../data/subtitles";

export const DashboardScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Overview &amp; Alerts"
        title="Your Entire Bot Workspace at a Glance"
        primaryScreen="screens/dashboard.png"
        secondaryScreen="screens/notifications-bell.png"
        switchFrame={165}
        accentShift={40}
        features={[
          {
            badge: "Live Snapshot",
            title: "Active Bots & Messages",
            detail: "See how many bots are online, messages answered, and runs completed each day.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Quick Shortcuts",
            title: "One-Click Actions",
            detail: "Jump straight into creating a bot, browsing templates, or starting a workflow.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "Header Bell",
            title: "Instant Notifications",
            detail: "Get notified immediately when bots connect, updates save, or billing changes.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.dashboard.captions} />
    </div>
  );
};

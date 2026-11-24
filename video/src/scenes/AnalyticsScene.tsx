import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { RN_COLORS } from "../components/UiPrimitives";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { SCENE_BY_ID } from "../data/subtitles";

export const AnalyticsScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Analytics, Settings &amp; Plans"
        title="Track Growth &amp; Scale with Simple Plans"
        primaryScreen="screens/analytics.png"
        secondaryScreen="screens/settings-billing.png"
        switchFrame={175}
        accentShift={-40}
        features={[
          {
            badge: "Analytics & Insights",
            title: "Messages, Outcomes & Trends",
            detail: "See top user commands, bot reliability, and activity across 7-day or 30-day charts.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Workspace Controls",
            title: "Team, Security & Alerts",
            detail: "Manage team members, notification preferences, themes, and connected tools cleanly.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "USD & INR Billing",
            title: "Free, Pro & Business Plans",
            detail: "Start free forever, or pay monthly/annually with Card or UPI QR whenever you need more bots.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.analytics.captions} />
    </div>
  );
};

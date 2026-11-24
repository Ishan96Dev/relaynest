import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { RN_COLORS } from "../components/UiPrimitives";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { SCENE_BY_ID } from "../data/subtitles";

export const WorkflowScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Automations &amp; Executions"
        title="Build Visual Workflows with Zero Code"
        primaryScreen="screens/workflow-editor.png"
        secondaryScreen="screens/executions.png"
        switchFrame={205}
        accentShift={-90}
        features={[
          {
            badge: "Visual Canvas",
            title: "Triggers & Smart Choices",
            detail: "Decide what starts your flow — user commands, keywords, or weekly schedules.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Interactive Replies",
            title: "Buttons & Follow-Ups",
            detail: "Guide Telegram visitors with clean reply buttons and automated notifications.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "Executions Log",
            title: "Every Run Recorded Clearly",
            detail: "Inspect past workflow runs to verify everything succeeded as expected.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.workflow.captions} />
    </div>
  );
};

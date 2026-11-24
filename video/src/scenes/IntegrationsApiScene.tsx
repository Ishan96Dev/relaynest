import React from "react";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { ScreenShowcaseCard } from "../components/ScreenShowcaseCard";
import { RN_COLORS } from "../components/UiPrimitives";
import { SCENE_BY_ID } from "../data/subtitles";

export const IntegrationsApiScene: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <ScreenShowcaseCard
        eyebrow="Integrations, API Keys &amp; Swagger UI"
        title="Connect Any App &amp; Test Live APIs"
        primaryScreen="screens/integrations.png"
        secondaryScreen="screens/settings-api-keys.png"
        tertiaryScreen="screens/api-swagger-ui.png"
        switchFrame={132}
        thirdSwitchFrame={218}
        accentShift={25}
        features={[
          {
            badge: "Signed Webhooks & Channels",
            title: "Incoming & Outbound Hooks",
            detail: "Trigger workflows with X-RelayNest-Secret or push Slack, Discord & REST events with one-click Test Ping.",
            accent: RN_COLORS.cyan,
          },
          {
            badge: "Scoped API Keys",
            title: "Production Credentials in Supabase",
            detail: "Generate rnk_live_ Bearer keys with granular scopes, expiry windows, and 7-day telemetry.",
            accent: RN_COLORS.lavender,
          },
          {
            badge: "In-App Swagger UI",
            title: "Authorize, Execute & Notify",
            detail: "Test OpenAPI 3.1 endpoints inside your authenticated workspace and receive instant Bell alerts.",
            accent: RN_COLORS.ok,
          },
        ]}
      />
      <AnimatedSubtitles captions={SCENE_BY_ID.integrationsApi.captions} />
    </div>
  );
};

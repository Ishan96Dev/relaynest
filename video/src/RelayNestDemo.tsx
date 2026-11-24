import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import React from "react";
import { Sequence, Track, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SubtitlesVisibilityContext } from "./components/AnimatedSubtitles";
import { SCENE_BY_ID, TOTAL_DURATION_FRAMES, TRANSITION_FRAMES, VO_DELAY_FRAMES } from "./data/subtitles";
import { AiAgentScene } from "./scenes/AiAgentScene";
import { AiStudioScene } from "./scenes/AiStudioScene";
import { AnalyticsScene } from "./scenes/AnalyticsScene";
import { CloserScene } from "./scenes/CloserScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { IntroScene } from "./scenes/IntroScene";
import { IntegrationsApiScene } from "./scenes/IntegrationsApiScene";
import { ManageBotScene } from "./scenes/ManageBotScene";
import { TelegramConnectScene } from "./scenes/TelegramConnectScene";
import { TemplatesScene } from "./scenes/TemplatesScene";
import { WorkflowScene } from "./scenes/WorkflowScene";

export type RelayNestDemoProps = {
  readonly showSubtitles?: boolean;
};

const BackgroundMusic: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Warm soft tech bed ducked neatly beneath the spoken voiceover
  const introDuck = interpolate(frame, [0, 0.7 * fps, 1.8 * fps], [0, 0.2, 0.13], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outroFade = interpolate(
    frame,
    [TOTAL_DURATION_FRAMES - 2.2 * fps, TOTAL_DURATION_FRAMES - 1.2 * fps, TOTAL_DURATION_FRAMES],
    [1, 1.15, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <Audio
      src={staticFile("audio/bg-tech-loop.mp3")}
      loop
      volume={introDuck * outroFade}
      durationInFrames={TOTAL_DURATION_FRAMES}
    />
  );
};

export const RelayNestDemo: React.FC<RelayNestDemoProps> = ({ showSubtitles = true }) => {
  const timing = linearTiming({ durationInFrames: TRANSITION_FRAMES });

  const sIntro = SCENE_BY_ID.intro;
  const sDash = SCENE_BY_ID.dashboard;
  const sTg = SCENE_BY_ID.telegram;
  const sManage = SCENE_BY_ID.manageBot;
  const sTpl = SCENE_BY_ID.templates;
  const sWf = SCENE_BY_ID.workflow;
  const sStudio = SCENE_BY_ID.aiStudio;
  const sAi = SCENE_BY_ID.aiAgent;
  const sAn = SCENE_BY_ID.analytics;
  const sApi = SCENE_BY_ID.integrationsApi;
  const sClose = SCENE_BY_ID.closer;

  return (
    <SubtitlesVisibilityContext.Provider value={showSubtitles}>
      <div style={{ position: "relative", width: "100%", height: "100%", backgroundColor: "#08081A" }}>
        <TransitionSeries>
          <TransitionSeries.Sequence name="Intro" durationInFrames={sIntro.durationFrames}>
            <IntroScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sIntro.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Overview Dashboard" durationInFrames={sDash.durationFrames}>
            <DashboardScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sDash.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="My Bots & Connect" durationInFrames={sTg.durationFrames}>
            <TelegramConnectScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sTg.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Manage & Edit Bot" durationInFrames={sManage.durationFrames}>
            <ManageBotScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sManage.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Bot Templates" durationInFrames={sTpl.durationFrames}>
            <TemplatesScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sTpl.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Visual Automations" durationInFrames={sWf.durationFrames}>
            <WorkflowScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sWf.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="AI Catalog & Playground" durationInFrames={sStudio.durationFrames}>
            <AiStudioScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sStudio.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Knowledge Base & AI Agents" durationInFrames={sAi.durationFrames}>
            <AiAgentScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sAi.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Analytics, Settings & Plans" durationInFrames={sAn.durationFrames}>
            <AnalyticsScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sAn.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Integrations, API Keys & Swagger UI" durationInFrames={sApi.durationFrames}>
            <IntegrationsApiScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sApi.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition presentation={fade()} timing={timing} />

          <TransitionSeries.Sequence name="Start Free CTA" durationInFrames={sClose.durationFrames}>
            <CloserScene />
            <Audio from={VO_DELAY_FRAMES} src={staticFile(sClose.audioFile)} volume={0.97} />
          </TransitionSeries.Sequence>
        </TransitionSeries>

        <Track name="Music">
          <BackgroundMusic />
        </Track>

        {/* Subtle scene transition SFX synced to exact TransitionSeries cuts */}
        <Sequence name="Sound Effects" layout="none">
          <Audio from={sIntro.startFrame + 8} src={staticFile("audio/ding.ogg")} volume={0.2} />
          <Audio from={sDash.startFrame} src={staticFile("audio/whoosh.ogg")} volume={0.22} />
          <Audio from={sDash.startFrame + 165} src={staticFile("audio/pop.ogg")} volume={0.2} />
          <Audio from={sTg.startFrame} src={staticFile("audio/swipe.ogg")} volume={0.22} />
          <Audio from={sTg.startFrame + 185} src={staticFile("audio/pop.ogg")} volume={0.2} />
          <Audio from={sManage.startFrame} src={staticFile("audio/swipe.ogg")} volume={0.22} />
          <Audio from={sManage.startFrame + 165} src={staticFile("audio/pop.ogg")} volume={0.2} />
          <Audio from={sTpl.startFrame} src={staticFile("audio/whoosh.ogg")} volume={0.22} />
          <Audio from={sWf.startFrame} src={staticFile("audio/swipe.ogg")} volume={0.22} />
          <Audio from={sWf.startFrame + 205} src={staticFile("audio/pop.ogg")} volume={0.2} />
          <Audio from={sStudio.startFrame} src={staticFile("audio/whoosh.ogg")} volume={0.22} />
          <Audio from={sStudio.startFrame + 165} src={staticFile("audio/pop.ogg")} volume={0.2} />
          <Audio from={sAi.startFrame} src={staticFile("audio/swipe.ogg")} volume={0.22} />
          <Audio from={sAi.startFrame + 175} src={staticFile("audio/ding.ogg")} volume={0.22} />
          <Audio from={sAn.startFrame} src={staticFile("audio/whoosh.ogg")} volume={0.22} />
          <Audio from={sAn.startFrame + 175} src={staticFile("audio/pop.ogg")} volume={0.2} />
          <Audio from={sApi.startFrame} src={staticFile("audio/swipe.ogg")} volume={0.22} />
          <Audio from={sApi.startFrame + 165} src={staticFile("audio/ding.ogg")} volume={0.2} />
          <Audio from={sClose.startFrame - 18} durationInFrames={42} src={staticFile("audio/riser.ogg")} volume={0.18} />
          <Audio from={sClose.startFrame + 8} src={staticFile("audio/impact.ogg")} volume={0.24} />
          <Audio from={sClose.startFrame + 48} src={staticFile("audio/ding.ogg")} volume={0.24} />
        </Sequence>
      </div>
    </SubtitlesVisibilityContext.Provider>
  );
};

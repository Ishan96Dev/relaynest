import React from "react";
import { Composition, Folder } from "remotion";
import { SCENE_BY_ID, TOTAL_DURATION_FRAMES, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "./data/subtitles";
import { RelayNestDemo } from "./RelayNestDemo";
import { AiAgentScene } from "./scenes/AiAgentScene";
import { AiStudioScene } from "./scenes/AiStudioScene";
import { AnalyticsScene } from "./scenes/AnalyticsScene";
import { CloserScene } from "./scenes/CloserScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { IntroScene } from "./scenes/IntroScene";
import { ManageBotScene } from "./scenes/ManageBotScene";
import { TelegramConnectScene } from "./scenes/TelegramConnectScene";
import { TemplatesScene } from "./scenes/TemplatesScene";
import { WorkflowScene } from "./scenes/WorkflowScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="RelayNestDemo"
        component={RelayNestDemo}
        durationInFrames={TOTAL_DURATION_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{ showSubtitles: true }}
      />
      <Folder name="Scenes">
        <Composition id="IntroScene" component={IntroScene} durationInFrames={SCENE_BY_ID.intro.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="DashboardScene" component={DashboardScene} durationInFrames={SCENE_BY_ID.dashboard.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="TelegramConnectScene" component={TelegramConnectScene} durationInFrames={SCENE_BY_ID.telegram.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="ManageBotScene" component={ManageBotScene} durationInFrames={SCENE_BY_ID.manageBot.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="TemplatesScene" component={TemplatesScene} durationInFrames={SCENE_BY_ID.templates.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="WorkflowScene" component={WorkflowScene} durationInFrames={SCENE_BY_ID.workflow.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="AiStudioScene" component={AiStudioScene} durationInFrames={SCENE_BY_ID.aiStudio.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="AiAgentScene" component={AiAgentScene} durationInFrames={SCENE_BY_ID.aiAgent.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="AnalyticsScene" component={AnalyticsScene} durationInFrames={SCENE_BY_ID.analytics.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <Composition id="CloserScene" component={CloserScene} durationInFrames={SCENE_BY_ID.closer.durationFrames} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
      </Folder>
    </>
  );
};

import type { Caption } from "@remotion/captions";
import voManifest from "./vo-manifest.json";

export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const TRANSITION_FRAMES = 15;
export const VO_DELAY_FRAMES = 12; // 400ms lead-in per scene before narration begins
export const VO_DELAY_MS = Math.round((VO_DELAY_FRAMES / VIDEO_FPS) * 1000);
export const TAIL_MS = 650; // smooth breathing room across 15-frame transition

export type SceneId =
  | "intro"
  | "dashboard"
  | "telegram"
  | "manageBot"
  | "templates"
  | "workflow"
  | "aiStudio"
  | "aiAgent"
  | "analytics"
  | "integrationsApi"
  | "closer";

type RawManifestEntry = {
  id: SceneId;
  title: string;
  text: string;
  audioFile: string;
  durationMs: number;
  words: Array<{ text: string; startMs: number; endMs: number }>;
};

const manifest = voManifest as RawManifestEntry[];

function toCaptions(words: Array<{ text: string; startMs: number; endMs: number }>): Caption[] {
  return words.map((w, idx) => ({
    text: idx === 0 ? w.text.trimStart() : ` ${w.text.trimStart()}`,
    startMs: w.startMs + VO_DELAY_MS,
    endMs: w.endMs + VO_DELAY_MS,
    timestampMs: Math.round((w.startMs + w.endMs) / 2) + VO_DELAY_MS,
    confidence: 1,
  }));
}

export type SceneEntry = {
  id: SceneId;
  title: string;
  text: string;
  audioFile: string;
  durationMs: number;
  durationFrames: number;
  startFrame: number;
  captions: Caption[];
};

const computed: SceneEntry[] = [];
let runningStart = 0;

for (let i = 0; i < manifest.length; i++) {
  const m = manifest[i]!;
  const totalMs = VO_DELAY_MS + m.durationMs + TAIL_MS;
  const durationFrames = Math.ceil((totalMs / 1000) * VIDEO_FPS);
  computed.push({
    id: m.id,
    title: m.title,
    text: m.text,
    audioFile: m.audioFile,
    durationMs: m.durationMs,
    durationFrames,
    startFrame: runningStart,
    captions: toCaptions(m.words),
  });
  runningStart += durationFrames - (i < manifest.length - 1 ? TRANSITION_FRAMES : 0);
}

export const SCENE_ORDER: SceneEntry[] = computed;
export const TOTAL_DURATION_FRAMES = runningStart;

export const SCENE_BY_ID = Object.fromEntries(
  computed.map((entry) => [entry.id, entry]),
) as Record<SceneId, SceneEntry>;

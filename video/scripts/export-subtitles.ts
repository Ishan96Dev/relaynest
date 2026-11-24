import fs from "node:fs";
import path from "node:path";
import { SCENE_ORDER, VIDEO_FPS } from "../src/data/subtitles";

function fmtVtt(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const rem = clamped % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(rem).padStart(3, "0")}`;
}

function fmtSrt(ms: number): string {
  return fmtVtt(ms).replace(".", ",");
}

const cues: Array<{ startMs: number; endMs: number; text: string }> = [];

for (const scene of SCENE_ORDER) {
  const sceneOffsetMs = (scene.startFrame / VIDEO_FPS) * 1000;

  let chunkWords: string[] = [];
  let chunkStart = -1;
  let chunkEnd = 0;

  for (let i = 0; i < scene.captions.length; i++) {
    const cap = scene.captions[i]!;
    if (chunkStart < 0) chunkStart = cap.startMs;
    chunkWords.push(cap.text.trim());
    chunkEnd = cap.endMs;

    const isEnd = i === scene.captions.length - 1;
    const nextGap = !isEnd ? scene.captions[i + 1]!.startMs - cap.endMs : 999;
    if (chunkWords.length >= 6 || nextGap >= 300 || isEnd) {
      cues.push({
        startMs: Math.round(sceneOffsetMs + chunkStart),
        endMs: Math.round(sceneOffsetMs + chunkEnd),
        text: chunkWords.join(" "),
      });
      chunkWords = [];
      chunkStart = -1;
    }
  }
}

const outDir = path.resolve("../frontend/public/video");
fs.mkdirSync(outDir, { recursive: true });

const vtt = [
  "WEBVTT",
  "",
  ...cues.map((c, idx) => `${idx + 1}\n${fmtVtt(c.startMs)} --> ${fmtVtt(c.endMs)}\n${c.text}\n`),
].join("\n");

const srt = cues
  .map((c, idx) => `${idx + 1}\n${fmtSrt(c.startMs)} --> ${fmtSrt(c.endMs)}\n${c.text}\n`)
  .join("\n");

fs.writeFileSync(path.join(outDir, "relaynest-product-demo.vtt"), vtt, "utf8");
fs.writeFileSync(path.join(outDir, "relaynest-product-demo.srt"), srt, "utf8");

console.log(`Exported ${cues.length} voice-synced subtitle cues -> ${outDir}`);
console.log(
  "Scene timeline (sec):",
  SCENE_ORDER.map((s) => `${s.id}=${(s.startFrame / VIDEO_FPS).toFixed(2)}s`).join(", "),
);

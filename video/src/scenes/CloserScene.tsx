import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { BRAND_FONT, RN_COLORS, SceneBackdrop } from "../components/UiPrimitives";
import { SCENE_BY_ID } from "../data/subtitles";

const ROTATING_WORDS = ["Support", "Workflows", "AI Agents", "Analytics"];

export const CloserScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = spring({ frame: frame - 8, fps, config: { damping: 15, stiffness: 170 } });
  const copyIn = spring({ frame: frame - 24, fps, config: { damping: 18, stiffness: 170 } });
  const ctaIn = spring({ frame: frame - 48, fps, config: { damping: 16, stiffness: 190 } });

  const wordIndex = Math.min(ROTATING_WORDS.length - 1, Math.floor(frame / 48));
  const currentWord = ROTATING_WORDS[wordIndex]!;
  const wordLocal = frame % 48;
  const wordPop = spring({ frame: wordLocal, fps, config: { damping: 16, stiffness: 240 } });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <SceneBackdrop />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 110,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 28,
            opacity: interpolate(logoIn, [0, 1], [0, 1]),
            transform: `scale(${interpolate(logoIn, [0, 1], [0.85, 1])})`,
          }}
        >
          <Img src={staticFile("brand/logo-icon-512.png")} style={{ width: 82, height: 82, borderRadius: 20 }} />
          <span style={{ fontFamily: BRAND_FONT, fontSize: 54, fontWeight: 800, color: RN_COLORS.text, letterSpacing: "-0.02em" }}>
            RelayNest
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            flexWrap: "wrap",
            fontFamily: BRAND_FONT,
            fontSize: 70,
            fontWeight: 800,
            letterSpacing: "-0.025em",
            color: RN_COLORS.text,
            opacity: interpolate(copyIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(copyIn, [0, 1], [24, 0])}px)`,
          }}
        >
          <span>Run all your</span>
          <span
            style={{
              display: "inline-block",
              padding: "6px 28px",
              borderRadius: 20,
              backgroundColor: "rgba(108, 71, 255, 0.28)",
              border: "1.5px solid rgba(34, 211, 238, 0.55)",
              color: RN_COLORS.cyan,
              transform: `scale(${interpolate(wordPop, [0, 1], [0.88, 1])})`,
            }}
          >
            {currentWord}
          </span>
          <span>in one platform.</span>
        </div>

        <div
          style={{
            marginTop: 42,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            opacity: interpolate(ctaIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(ctaIn, [0, 1], [20, 0])}px)`,
          }}
        >
          <div
            style={{
              padding: "18px 42px",
              borderRadius: 16,
              background: "linear-gradient(135deg, #6C47FF 0%, #3B82F6 100%)",
              color: "#FFFFFF",
              fontFamily: BRAND_FONT,
              fontSize: 28,
              fontWeight: 800,
              boxShadow: "0 16px 46px -10px rgba(108, 71, 255, 0.85)",
            }}
          >
            Start Building Free →
          </div>
          <span style={{ fontFamily: BRAND_FONT, fontSize: 20, fontWeight: 600, color: RN_COLORS.muted }}>
            Up to 3 bots free · No credit card required
          </span>
        </div>
      </div>

      <AnimatedSubtitles captions={SCENE_BY_ID.closer.captions} />
    </div>
  );
};

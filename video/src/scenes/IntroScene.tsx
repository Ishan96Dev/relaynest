import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedSubtitles } from "../components/AnimatedSubtitles";
import { BRAND_FONT, RN_COLORS, SceneBackdrop } from "../components/UiPrimitives";
import { SCENE_BY_ID } from "../data/subtitles";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = SCENE_BY_ID.intro.durationFrames;

  const logoSpring = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 160 } });
  const badgeIn = spring({ frame: frame - 24, fps, config: { damping: 18, stiffness: 180 } });
  const title1In = spring({ frame: frame - 38, fps, config: { damping: 18, stiffness: 170 } });
  const title2In = spring({ frame: frame - 56, fps, config: { damping: 18, stiffness: 170 } });
  const pillsIn = spring({ frame: frame - 84, fps, config: { damping: 20, stiffness: 160 } });

  const cameraScale = interpolate(frame, [0, totalFrames], [0.95, 1.04], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ringRotate = interpolate(frame, [0, totalFrames], [0, 65]);

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
          paddingBottom: 95,
          transform: `scale(${cameraScale})`,
        }}
      >
        <div style={{ position: "relative", marginBottom: 34 }}>
          <div
            style={{
              position: "absolute",
              inset: -28,
              borderRadius: "50%",
              border: "1.5px dashed rgba(167, 139, 250, 0.45)",
              transform: `rotate(${ringRotate}deg) scale(${interpolate(logoSpring, [0, 1], [0.7, 1])})`,
              opacity: interpolate(logoSpring, [0, 1], [0, 0.9]),
            }}
          />
          <div
            style={{
              width: 136,
              height: 136,
              borderRadius: 36,
              backgroundColor: "rgba(20, 18, 50, 0.92)",
              border: "1px solid rgba(167, 139, 250, 0.45)",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 0 80px -12px rgba(108, 71, 255, 0.78)",
              transform: `scale(${interpolate(logoSpring, [0, 1], [0.55, 1])}) rotate(${interpolate(logoSpring, [0, 1], [-12, 0])}deg)`,
              opacity: interpolate(logoSpring, [0, 1], [0, 1]),
            }}
          >
            <Img
              src={staticFile("brand/logo-icon-512.png")}
              style={{ width: 92, height: 92, borderRadius: 22 }}
            />
          </div>
        </div>

        <div
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            backgroundColor: "rgba(108, 71, 255, 0.2)",
            border: "1px solid rgba(167, 139, 250, 0.45)",
            color: RN_COLORS.lavender,
            fontFamily: BRAND_FONT,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 24,
            opacity: interpolate(badgeIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(badgeIn, [0, 1], [16, 0])}px)`,
          }}
        >
          No-Code Telegram Bot &amp; AI Platform
        </div>

        <h1
          style={{
            margin: 0,
            textAlign: "center",
            fontFamily: BRAND_FONT,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: "-0.03em",
            color: RN_COLORS.text,
            opacity: interpolate(title1In, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(title1In, [0, 1], [32, 0])}px)`,
          }}
        >
          Build Telegram Bots.
        </h1>

        <h1
          style={{
            margin: "6px 0 0 0",
            textAlign: "center",
            fontFamily: BRAND_FONT,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            background: "linear-gradient(95deg, #A78BFA 0%, #22D3EE 52%, #4ADE80 100%)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            opacity: interpolate(title2In, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(title2In, [0, 1], [34, 0])}px)`,
          }}
        >
          Automate Everything.
        </h1>

        <div
          style={{
            display: "flex",
            gap: 18,
            marginTop: 42,
            opacity: interpolate(pillsIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(pillsIn, [0, 1], [22, 0])}px)`,
          }}
        >
          {["Telegram Bots", "Bot Templates", "Visual Flows", "AI Assistants"].map((label, idx) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 22px",
                borderRadius: 14,
                backgroundColor: "rgba(20, 18, 50, 0.85)",
                border: "1px solid rgba(44, 40, 96, 0.95)",
                fontFamily: BRAND_FONT,
                fontSize: 20,
                fontWeight: 600,
                color: RN_COLORS.text,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  backgroundColor: idx % 2 === 0 ? RN_COLORS.cyan : RN_COLORS.lavender,
                }}
              />
              {label}
            </div>
          ))}
        </div>
      </div>

      <AnimatedSubtitles captions={SCENE_BY_ID.intro.captions} />
    </div>
  );
};

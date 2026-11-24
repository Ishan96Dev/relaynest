import type { Caption } from "@remotion/captions";
import { createTikTokStyleCaptions } from "@remotion/captions";
import React, { useContext, useMemo } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND_FONT } from "./UiPrimitives";

export const SubtitlesVisibilityContext = React.createContext<boolean>(true);

export const AnimatedSubtitles: React.FC<{
  readonly captions: Caption[];
  readonly combineMs?: number;
}> = ({ captions, combineMs = 2100 }) => {
  const show = useContext(SubtitlesVisibilityContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: combineMs,
      }),
    [captions, combineMs],
  );

  if (!show) return null;

  const activePage = pages.find(
    (p) => currentTimeMs >= p.startMs && currentTimeMs < p.startMs + p.durationMs,
  );

  if (!activePage) {
    return null;
  }

  const pageEnterFrame = (activePage.startMs / 1000) * fps;
  const containerIn = spring({
    frame: frame - pageEnterFrame,
    fps,
    config: { damping: 18, stiffness: 220, mass: 0.7 },
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 50,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1220,
          padding: "14px 28px",
          borderRadius: 18,
          backgroundColor: "rgba(10, 9, 28, 0.86)",
          border: "1px solid rgba(167, 139, 250, 0.35)",
          boxShadow: "0 18px 46px -12px rgba(0, 0, 0, 0.85), 0 0 28px -10px rgba(108, 71, 255, 0.5)",
          backdropFilter: "blur(10px)",
          textAlign: "center",
          fontFamily: BRAND_FONT,
          fontSize: 38,
          fontWeight: 700,
          lineHeight: 1.32,
          letterSpacing: "-0.01em",
          opacity: interpolate(containerIn, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(containerIn, [0, 1], [14, 0])}px)`,
        }}
      >
        {activePage.tokens.map((token, i) => {
          const isCurrent = currentTimeMs >= token.fromMs && currentTimeMs <= token.toMs;
          const isPast = currentTimeMs > token.toMs;
          const enterFrame = (token.fromMs / 1000) * fps;
          const pop = spring({
            frame: frame - enterFrame,
            fps,
            config: { damping: 14, stiffness: 280, mass: 0.5 },
          });
          const scale = isCurrent
            ? interpolate(pop, [0, 1], [0.92, 1.06])
            : isPast
              ? 1
              : 0.96;

          return (
            <span
              key={`${token.fromMs}-${i}`}
              style={{
                display: "inline-block",
                marginLeft: i === 0 ? 0 : "0.28em",
                color: isCurrent ? "#22D3EE" : isPast ? "#F8F8FF" : "rgba(248, 248, 255, 0.56)",
                textShadow: isCurrent
                  ? "0 0 18px rgba(34, 211, 238, 0.45), 0 2px 6px rgba(0,0,0,0.9)"
                  : "0 2px 6px rgba(0,0,0,0.9)",
                transform: `scale(${scale})`,
              }}
            >
              {token.text.trim()}
            </span>
          );
        })}
      </div>
    </div>
  );
};

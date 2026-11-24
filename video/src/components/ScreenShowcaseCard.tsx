import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND_FONT, RN_COLORS, SceneBackdrop, SceneHeaderBar } from "./UiPrimitives";

export interface ScreenFeature {
  readonly badge: string;
  readonly title: string;
  readonly detail: string;
  readonly accent?: string;
}

export const ScreenShowcaseCard: React.FC<{
  readonly eyebrow: string;
  readonly title: string;
  readonly primaryScreen: string;
  readonly secondaryScreen?: string;
  readonly tertiaryScreen?: string;
  readonly switchFrame?: number;
  readonly thirdSwitchFrame?: number;
  readonly features: ScreenFeature[];
  readonly accentShift?: number;
}> = ({
  eyebrow,
  title,
  primaryScreen,
  secondaryScreen,
  tertiaryScreen,
  switchFrame = 155,
  thirdSwitchFrame = 235,
  features,
  accentShift = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const frameIn = spring({ frame: frame - 4, fps, config: { damping: 18, stiffness: 170 } });
  const zoom = interpolate(frame, [0, 320], [1.0, 1.055], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const panY = interpolate(frame, [0, 320], [0, -14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const secondFade = secondaryScreen
    ? interpolate(frame, [switchFrame - 10, switchFrame + 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const thirdFade = tertiaryScreen
    ? interpolate(frame, [thirdSwitchFrame - 10, thirdSwitchFrame + 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <SceneBackdrop accentShift={accentShift} />
      <div style={{ position: "relative", height: "100%", padding: "46px 92px 168px" }}>
        <SceneHeaderBar eyebrow={eyebrow} title={title} delayFrames={4} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.38fr 0.62fr",
            gap: 28,
            marginTop: 10,
            height: 600,
            opacity: interpolate(frameIn, [0, 1], [0, 1]),
          }}
        >
          {/* Left: Real App Screen Browser Showcase */}
          <div
            style={{
              position: "relative",
              borderRadius: 24,
              backgroundColor: "#0C0B22",
              border: "1.5px solid rgba(167, 139, 250, 0.36)",
              boxShadow: "0 28px 80px -22px rgba(0,0,0,0.88), 0 0 60px -24px rgba(108, 71, 255, 0.55)",
              overflow: "hidden",
            }}
          >
            {/* Subtle macOS browser header */}
            <div
              style={{
                height: 36,
                backgroundColor: "#141232",
                borderBottom: `1px solid ${RN_COLORS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
              }}
            >
              <div style={{ display: "flex", gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#F87171" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#FBBF24" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#4ADE80" }} />
              </div>
              <span style={{ fontFamily: BRAND_FONT, fontSize: 12, fontWeight: 600, color: RN_COLORS.muted }}>
                app.relaynest.com
              </span>
              <div style={{ width: 42 }} />
            </div>

            <div style={{ position: "relative", width: "100%", height: "calc(100% - 36px)", overflow: "hidden" }}>
              <Img
                src={staticFile(primaryScreen)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "top center",
                  transform: `scale(${zoom}) translateY(${panY}px)`,
                }}
              />
              {secondaryScreen && (
                <Img
                  src={staticFile(secondaryScreen)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    opacity: secondFade,
                    transform: `scale(${zoom}) translateY(${panY}px)`,
                  }}
                />
              )}
              {tertiaryScreen && (
                <Img
                  src={staticFile(tertiaryScreen)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    opacity: thirdFade,
                    transform: `scale(${zoom}) translateY(${panY}px)`,
                  }}
                />
              )}
            </div>
          </div>

          {/* Right: User-Friendly Benefit Callouts */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
            {features.map((f, idx) => {
              const s = spring({ frame: frame - (16 + idx * 18), fps, config: { damping: 16, stiffness: 185 } });
              const accent = f.accent ?? (idx === 0 ? RN_COLORS.cyan : idx === 1 ? RN_COLORS.lavender : RN_COLORS.ok);
              return (
                <div
                  key={f.title}
                  style={{
                    padding: "20px 22px",
                    borderRadius: 20,
                    backgroundColor: RN_COLORS.surface,
                    border: `1px solid ${RN_COLORS.border}`,
                    boxShadow: "0 16px 36px -14px rgba(0,0,0,0.7)",
                    opacity: interpolate(s, [0, 1], [0, 1]),
                    transform: `translateX(${interpolate(s, [0, 1], [26, 0])}px)`,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      fontFamily: BRAND_FONT,
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "4px 10px",
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      color: accent,
                    }}
                  >
                    {f.badge}
                  </span>
                  <div style={{ fontFamily: BRAND_FONT, fontSize: 22, fontWeight: 800, color: RN_COLORS.text, marginTop: 10 }}>
                    {f.title}
                  </div>
                  <div style={{ fontFamily: BRAND_FONT, fontSize: 15, lineHeight: 1.48, color: RN_COLORS.muted, marginTop: 6 }}>
                    {f.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

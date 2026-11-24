import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";
import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

export const BRAND_FONT = fontFamily;

export const RN_COLORS = {
  bg: "#08081A",
  surface: "#141232",
  surface2: "#0F0E28",
  border: "#2C2860",
  text: "#F8F8FF",
  muted: "#A6A3C8",
  primary: "#6C47FF",
  secondary: "#8B5CF6",
  lavender: "#A78BFA",
  cyan: "#22D3EE",
  blue: "#3B82F6",
  ok: "#4ADE80",
  warn: "#FBBF24",
} as const;

export const SceneBackdrop: React.FC<{ readonly accentShift?: number }> = ({ accentShift = 0 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 45) * 18;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: RN_COLORS.bg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -180 + drift + accentShift,
          top: -160,
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(108, 71, 255, 0.34), transparent 65%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -140 - drift,
          bottom: -180,
          width: 680,
          height: 680,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34, 211, 238, 0.22), transparent 65%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(167, 139, 250, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(167, 139, 250, 0.06) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse at 50% 45%, black 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 45%, black 35%, transparent 80%)",
        }}
      />
    </div>
  );
};

export const SceneHeaderBar: React.FC<{
  readonly eyebrow: string;
  readonly title: string;
  readonly delayFrames?: number;
}> = ({ eyebrow, title, delayFrames = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: 20, stiffness: 180 },
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 28,
        opacity: interpolate(progress, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(progress, [0, 1], [18, 0])}px)`,
      }}
    >
      <div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 999,
            backgroundColor: "rgba(108, 71, 255, 0.18)",
            border: "1px solid rgba(167, 139, 250, 0.4)",
            color: RN_COLORS.lavender,
            fontFamily: BRAND_FONT,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: RN_COLORS.cyan,
            }}
          />
          {eyebrow}
        </div>
        <h2
          style={{
            margin: "10px 0 0 0",
            fontFamily: BRAND_FONT,
            fontSize: 44,
            fontWeight: 800,
            color: RN_COLORS.text,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Img
          src={staticFile("brand/logo-icon-512.png")}
          style={{ width: 42, height: 42, borderRadius: 11 }}
        />
        <span
          style={{
            fontFamily: BRAND_FONT,
            fontSize: 22,
            fontWeight: 800,
            color: RN_COLORS.text,
          }}
        >
          RelayNest
        </span>
      </div>
    </div>
  );
};

export const AnimatedCursor: React.FC<{
  readonly points: Array<{ frame: number; x: number; y: number }>;
  readonly clickFrame?: number;
}> = ({ points, clickFrame }) => {
  const frame = useCurrentFrame();
  if (points.length === 0) return null;

  let x = points[0]!.x;
  let y = points[0]!.y;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const next = points[i]!;
    if (frame >= prev.frame && frame <= next.frame) {
      x = interpolate(frame, [prev.frame, next.frame], [prev.x, next.x], {
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      y = interpolate(frame, [prev.frame, next.frame], [prev.y, next.y], {
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;
    }
    if (frame > next.frame) {
      x = next.x;
      y = next.y;
    }
  }

  const isClick = clickFrame !== undefined && frame >= clickFrame && frame <= clickFrame + 16;
  const dipScale =
    clickFrame !== undefined && frame >= clickFrame && frame <= clickFrame + 8
      ? interpolate(frame, [clickFrame, clickFrame + 4, clickFrame + 8], [1, 0.84, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const rippleProgress =
    clickFrame !== undefined && isClick
      ? interpolate(frame, [clickFrame, clickFrame + 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        pointerEvents: "none",
        zIndex: 60,
        transform: `scale(${dipScale})`,
        transformOrigin: "0 0",
      }}
    >
      {isClick && (
        <div
          style={{
            position: "absolute",
            left: -24,
            top: -24,
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "2.5px solid #22D3EE",
            opacity: 1 - rippleProgress,
            transform: `scale(${0.4 + rippleProgress * 1.4})`,
          }}
        />
      )}
      <svg width="34" height="38" viewBox="0 0 28 32" fill="none">
        <path
          d="M2.5 2L11.5 28L15.4 17.6L25.5 14L2.5 2Z"
          fill="#FFFFFF"
          stroke="#08081A"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

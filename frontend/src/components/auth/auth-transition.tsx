"use client";

import Image from "next/image";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type AuthTransitionMode = "signin" | "signup" | "signout";

const META: Record<
  AuthTransitionMode,
  {
    eyebrow: string;
    heading: (first: string) => string;
    subtitle: string;
    bar: string;
  }
> = {
  signin: {
    eyebrow: "Welcome Back",
    heading: (first) => (first ? `Welcome back, ${first}!` : "Welcome back!"),
    subtitle: "Opening your RelayNest workspace...",
    bar: "from-[#6C47FF] via-[#A78BFA] to-[#22D3EE]",
  },
  signup: {
    eyebrow: "Account Created",
    heading: (first) => (first ? `Welcome to RelayNest, ${first}!` : "Welcome to RelayNest!"),
    subtitle: "Your account is ready — taking you to sign in...",
    bar: "from-[#22D3EE] via-[#3B82F6] to-[#6C47FF]",
  },
  signout: {
    eyebrow: "See You Soon",
    heading: (first) => (first ? `See you soon, ${first}!` : "See you soon!"),
    subtitle: "Signing you out and returning to the login screen...",
    bar: "from-[#A78BFA] via-[#6C47FF] to-[#3B82F6]",
  },
};

export function AuthTransition({
  mode,
  name,
  email,
  subtitleOverride,
  className,
}: {
  mode: AuthTransitionMode;
  name?: string | null;
  email?: string | null;
  subtitleOverride?: string;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [progress, setProgress] = React.useState(28);

  React.useEffect(() => {
    setMounted(true);
    const t1 = setTimeout(() => setProgress(72), 180);
    const t2 = setTimeout(() => setProgress(100), 620);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const firstRaw = name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "";
  const first = firstRaw ? firstRaw.charAt(0).toUpperCase() + firstRaw.slice(1) : "";
  const meta = META[mode];

  const overlay = (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[9999] flex min-h-dvh w-screen items-center justify-center overflow-hidden bg-[#08081A] px-6 text-[#F8F8FF]",
        className,
      )}
      style={{ animation: "rn-fade-in 0.22s ease-out both" }}
    >
      {/* Signature RelayNest ambient radial lighting + perspective floor */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-8 size-[520px] rounded-full bg-[#6C47FF]/30 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-8 size-[460px] rounded-full bg-[#22D3EE]/22 blur-[110px]"
      />
      <div className="hero-grid opacity-55" aria-hidden />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        {/* Animated LogoHalo */}
        <div className="relative mb-7 grid size-28 place-items-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-dashed border-[#A78BFA]/50 animate-spin [animation-duration:12s]"
          />
          <span
            aria-hidden
            className="absolute inset-2 rounded-full bg-gradient-to-tr from-[#6C47FF]/30 to-[#22D3EE]/25 blur-xl"
          />
          <div className="relative grid size-22 place-items-center rounded-[26px] border border-[#A78BFA]/45 bg-[#141232] shadow-[0_0_60px_-10px_rgba(108,71,255,0.85)]">
            <Image
              src="/brand/logo-icon-512.png"
              alt="RelayNest"
              width={60}
              height={60}
              className="rounded-xl"
              priority
            />
          </div>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-[#A78BFA]/40 bg-[#6C47FF]/20 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#A78BFA]">
          <span className="size-1.5 rounded-full bg-[#22D3EE]" aria-hidden />
          {meta.eyebrow}
        </span>

        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
          {meta.heading(first)}
        </h1>

        <p className="mt-3 max-w-md text-base text-[#A6A3C8] sm:text-lg">
          {subtitleOverride ?? meta.subtitle}
        </p>

        {/* Smooth Brand Progress Bar */}
        <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-[#141232] ring-1 ring-[#2C2860]">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out", meta.bar)}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(overlay, document.body);
}

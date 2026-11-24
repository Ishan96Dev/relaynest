import { ArrowLeft, Gift, Lock, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { FitToHeight } from "./fit-to-height";
import { cn } from "@/lib/utils";

const art = {
  default: { ratio: 0.914, crop: "", src: "/images/auth/auth-login.webp", alt: "Welcome back to RelayNest. Create bots in minutes, automate workflows, track and optimize." },
  signup: { ratio: 0.914, crop: "", src: "/images/auth/auth-signup.webp", alt: "Build powerful Telegram bots with RelayNest." },
  recover: { ratio: 0.787, crop: "origin-top-left scale-[1.04]", src: "/images/auth/auth-forgot-password.webp", alt: "Reset your password. Secure and private, quick recovery, keep your data safe." },
  reset: { ratio: 0.914, crop: "", src: "/images/auth/auth-reset-password.webp", alt: "Set a new password. Strong security, keep your account safe, access your bots." },
} as const;

type Variant = keyof typeof art;

// x%, y%, delay (s), size (px)
const sparks: [number, number, number, number][] = [[12, 22, 0, 4], [84, 16, 1.1, 3], [90, 46, 2.2, 4], [8, 58, 0.7, 3], [72, 70, 1.8, 4], [30, 84, 2.9, 3], [52, 34, 0.4, 3], [20, 40, 2.5, 2], [66, 28, 3.1, 2]];

function Switch({ mode }: { mode: "login" | "signup" }) {
  const item = "relative z-10 grid h-9 flex-1 place-items-center rounded-full text-sm font-semibold transition-colors duration-300";
  return (
    <nav aria-label="Account" className="auth-switch relative mx-auto mb-5 flex w-full max-w-[280px] rounded-full border border-zinc-200 bg-zinc-100/80 p-1 [@media(max-height:640px)]:mb-3">
      <span aria-hidden className={cn("absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_4px_14px_-6px_rgba(108,71,255,0.55)] ring-1 ring-[#6C47FF]/20 transition-transform duration-300 ease-out", mode === "signup" ? "translate-x-full" : "translate-x-0")} />
      <Link href="/login" aria-current={mode === "login" ? "page" : undefined} className={cn(item, mode === "login" ? "text-[#6C47FF]" : "text-zinc-500 hover:text-zinc-800")}>Log in</Link>
      <Link href="/signup" aria-current={mode === "signup" ? "page" : undefined} className={cn(item, mode === "signup" ? "text-[#6C47FF]" : "text-zinc-500 hover:text-zinc-800")}>Sign up</Link>
    </nav>
  );
}

/**
 * One-viewport split layout (never scrolls the page). The left column is sized to the artwork aspect ratio (per-image ratio, about 0.8 to 0.91), so the image fills it exactly. On tall windows it is capped at 55vw and
 * cover trims a little off the sides. The right side has the clickable brand, a log in / sign up switch,
 * the form card and trust badges.
 */
export function AuthShell({
  variant = "default",
  hideSwitch = false,
  children,
}: {
  variant?: Variant;
  hideSwitch?: boolean;
  children: React.ReactNode;
}) {
  const a = art[variant];
  const mode = !hideSwitch && variant === "default" ? "login" : !hideSwitch && variant === "signup" ? "signup" : null;
  return (
    <div style={{ "--art-r": a.ratio } as React.CSSProperties} className="grid h-dvh grid-cols-1 overflow-hidden lg:grid-cols-[min(55vw,calc(var(--art-r)*100dvh))_minmax(0,1fr)]">
      <div className="relative hidden overflow-hidden bg-[#0B0A2A] lg:block" >
        <div className="art-breathe absolute inset-0"><div className={cn("absolute inset-0", a.crop)}>
          <Image src={a.src} alt={a.alt} fill priority sizes="55vw" className="object-cover object-center" /></div>
        </div>
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="art-aurora absolute -left-[15%] top-[30%] size-[55%] rounded-full bg-[#7C5CFF]/40 mix-blend-screen blur-3xl" />
          <div className="art-aurora absolute -right-[15%] bottom-[18%] size-[50%] rounded-full bg-[#22D3EE]/30 mix-blend-screen blur-3xl [animation-delay:-5s]" />
          <div className="art-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
          {sparks.map(([x, y, d, s], i) => (
            <span key={i} className="art-twinkle absolute rounded-full bg-white shadow-[0_0_10px_2px_rgba(167,139,250,0.9)]" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, "--d": `${d}s` } as React.CSSProperties} />
          ))}
        </div>
      </div>

      <main id="main" className="auth-panel relative flex h-dvh flex-col overflow-hidden bg-gradient-to-br from-[#F1EDFF] via-white to-[#E3F7FF] text-zinc-900 no-scrollbar">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -right-24 -top-24 size-[460px] rounded-full bg-[#6C47FF]/30 blur-3xl float-slow" />
          <div className="absolute -bottom-32 -left-24 size-[480px] rounded-full bg-[#22D3EE]/30 blur-3xl float" />
          <div className="absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7C5CFF]/10 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.7] [background-image:radial-gradient(#6C47FF33_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />
        </div>

        <header className="auth-head relative z-10 flex shrink-0 items-center justify-end px-6 pt-5 sm:px-10 [@media(max-height:640px)]:pt-3">
          <Link href="/" className="group inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-[#6C47FF]"><ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden /><span className="max-sm:sr-only">Back to home</span></Link>
        </header>

        <FitToHeight className="relative z-10 mx-auto flex min-h-0 w-full max-w-[470px] flex-1 flex-col justify-center overflow-hidden px-6 py-2 sm:px-8">
          <div className="fade-up">
            <div className="auth-logo mb-5 flex justify-center [@media(max-height:700px)]:mb-3"><Logo href="/" size={52} className="text-zinc-900 [&>span]:text-[32px]" /></div>
            {mode && <Switch mode={mode} />}
            <div className="relative rounded-3xl border border-zinc-200/80 bg-white/90 p-7 shadow-[0_24px_60px_-28px_rgba(108,71,255,0.45)] backdrop-blur sm:p-8 [@media(max-height:700px)]:p-5">
              <span aria-hidden className="absolute inset-x-8 -top-px h-[3px] rounded-full bg-gradient-to-r from-[#7C5CFF] via-[#3B82F6] to-[#22D3EE]" />
              {children}
            </div>
            <ul className="auth-trust mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-zinc-500 [@media(max-height:700px)]:hidden">
              <li className="flex items-center gap-1.5"><Lock className="size-3.5 text-[#6C47FF]" aria-hidden />Encrypted bot tokens</li>
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#6C47FF]" aria-hidden />Row-level security</li>
              <li className="flex items-center gap-1.5"><Gift className="size-3.5 text-[#6C47FF]" aria-hidden />Free plan, no card</li>
            </ul>
          </div>
        </FitToHeight>

        <footer className="auth-foot relative z-10 flex shrink-0 items-center justify-center gap-3 pb-4 text-xs text-zinc-400">
          <span>&copy; {new Date().getFullYear()} RelayNest</span><span aria-hidden>&middot;</span>
          <Link href="/privacy" className="hover:text-[#6C47FF]">Privacy</Link><span aria-hidden>&middot;</span>
          <Link href="/terms" className="hover:text-[#6C47FF]">Terms</Link>
        </footer>
      </main>
    </div>
  );
}
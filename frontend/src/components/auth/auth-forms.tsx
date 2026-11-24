"use client";

import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { assessPasswordStrength } from "@backend/lib/security/password";
import { AuthTransition } from "@/components/auth/auth-transition";
import { Checkbox } from "@/components/ui/choice";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient, preloadSupabase } from "@backend/lib/supabase/lazy";
import { cn } from "@/lib/utils";

const inputCls = "h-11 [@media(max-height:700px)]:h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/30 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50/60 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-500/25";
const btnCls = "sheen h-11 [@media(max-height:700px)]:h-10 w-full rounded-xl bg-gradient-to-b from-[#7C5CFF] to-[#5B34F0] text-sm font-semibold text-white shadow-[0_10px_24px_-10px_#6C47FF] transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-10px_#6C47FF] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label} <span className="text-red-500">*</span></label>
      {children}
      {error && <p role="alert" className="flex items-start gap-1 text-xs font-medium text-red-600"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{error}</p>}
    </div>
  );
}

function IconBox({ icon: Icon, ok, children }: { icon: typeof Mail; ok?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
      {children}
      {ok && <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-green-600" aria-label="Valid" />}
    </div>
  );
}

function PasswordInput(
{ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden /><input suppressHydrationWarning id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "pl-10 pr-11")} />
      <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-800">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function strength(pw: string): { score: 0 | 1 | 2 | 3; label: string; reason?: string } {
  const res = assessPasswordStrength(pw);
  return { score: res.score, label: res.label, reason: res.reason };
}

function Meter({ pw }: { pw: string }) {
  if (!pw) return null;
  const { score, label } = strength(pw);
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">{[1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= score ? (score === 3 ? "bg-green-500" : score === 2 ? "bg-amber-500" : "bg-red-500") : "bg-zinc-200")} />)}</div>
      <span className="text-xs text-zinc-600">{label}</span>
    </div>
  );
}

function DemoNotice() {
  return (
    <div role="status" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      Supabase is not configured, so authentication is disabled. <Link href="/dashboard" className="font-semibold underline">Continue to the demo dashboard</Link> or set the variables in <code>.env.example</code>.
    </div>
  );
}

function ErrorBox({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{msg}</div>;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.77.9 7.35 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
/** Google single sign-on. Supabase redirects to Google, then back to /auth/callback, which exchanges the code for a session. */
function GoogleSignIn({ next, onError }: { next?: string | null; onError: (msg: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  const configured = isSupabaseConfigured();
  async function go() {
    setBusy(true);
    const { error } = await (await createClient()).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(safeRedirectPath(next))}` },
    });
    if (error) { setBusy(false); onError("Google sign-in is unavailable right now. Try again or use email."); }
  }
  return (
    <div className="space-y-3.5 [@media(max-height:700px)]:space-y-2.5">
      <button type="button" onClick={go} disabled={busy || !configured}
        className="flex h-11 [@media(max-height:700px)]:h-10 w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white text-sm font-semibold text-zinc-800 shadow-sm transition duration-200 hover:-translate-y-px hover:border-zinc-400 hover:shadow-md active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? <span className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden /> : <GoogleIcon />}
        {busy ? "Redirecting to Google..." : "Continue with Google"}
      </button>
      <div className="auth-or flex items-center gap-3 text-xs text-zinc-500" aria-hidden><span className="h-px flex-1 bg-zinc-200" />or<span className="h-px flex-1 bg-zinc-200" /></div>
    </div>
  );
}
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/** Moves focus to the first highlighted field after a failed submit. */
function focusFirstInvalid() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>("input[aria-invalid=\"true\"]")?.focus());
}

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState<string | undefined>(sp.get("error") === "link" ? "That link is invalid or has expired." : undefined);
  const createdBanner = sp.get("created") === "1";
  const deletedBanner = sp.get("account") === "deleted";
  const [busy, setBusy] = React.useState(false);
  const [transitionName, setTransitionName] = React.useState<string | null>(null);
  const [fe, setFe] = React.useState<{ email?: string; password?: string }>({});
  const configured = isSupabaseConfigured();

  React.useEffect(() => { if (configured) preloadSupabase(); }, [configured]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = { email: !email.trim() ? "Enter your email address." : !emailOk(email) ? "Enter a valid email, like you@example.com." : undefined, password: pw ? undefined : "Enter your password." };
    setFe(found);
    if (found.email || found.password) { setErr(undefined); focusFirstInvalid(); return; }
    setBusy(true); setErr(undefined);
    const { data, error } = await (await createClient()).auth.signInWithPassword({ email, password: pw });
    if (error) { setBusy(false); return setErr("Invalid email or password."); } // do not reveal which one
    const metaName = (data.user?.user_metadata?.full_name as string | undefined) || (data.user?.user_metadata?.name as string | undefined) || email.split("@")[0] || "there";
    setTransitionName(metaName);
    void fetch("/api/v1/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "login_detected" }) }).catch(() => undefined);
    void fetch("/api/v1/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "auth.login", pagePath: "/login", detail: "Email & password sign-in" }) }).catch(() => undefined);
    setTimeout(() => {
      router.replace(safeRedirectPath(sp.get("next")));
    }, 1150);
  }

  return (
    <>
      {transitionName !== null && <AuthTransition mode="signin" name={transitionName} email={email} />}
      <form onSubmit={submit} noValidate className="space-y-4 [@media(max-height:700px)]:space-y-3">
      <div><h2 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">Log In to Your Account</h2><p className="mt-1 text-sm text-zinc-500">Welcome back! Please enter your details.</p></div>
      {createdBanner && <div role="status" className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"><Check className="mt-0.5 size-4 shrink-0" aria-hidden />Account created! Confirm your email if requested, then sign in below.</div>}
      {deletedBanner && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Check className="mt-0.5 size-4 shrink-0" aria-hidden />Your RelayNest account has been deleted. A confirmation email has been queued to your inbox.</div>}
      {!configured && <DemoNotice />}
      <ErrorBox msg={err} />
      <GoogleSignIn next={sp.get("next")} onError={setErr} />
      <Field id="email" label="Email Address" error={fe.email}><IconBox icon={Mail} ok={emailOk(email)}><input suppressHydrationWarning id="email" type="email" autoComplete="email" value={email} aria-invalid={Boolean(fe.email) || undefined} onChange={(e) => { setEmail(e.target.value); setFe((s) => ({ ...s, email: undefined })); }} className={cn(inputCls, "pl-10 pr-10")} placeholder="you@example.com" /></IconBox></Field>
      <Field id="password" label="Password"><PasswordInput id="password" value={pw} onChange={setPw} autoComplete="current-password" /></Field>
      <div className="flex items-center justify-between text-sm">
        <Checkbox tone="light" defaultChecked label="Remember me" />
        <Link href="/forgot-password" className="font-medium text-[#6C47FF] hover:underline">Forgot password?</Link>
      </div>
      <button className={btnCls} disabled={busy || !configured}>{busy ? <span className="inline-flex items-center justify-center gap-2"><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />Logging in...</span> : "Log In"}</button>
      <p className="text-center text-sm text-zinc-600">Don&apos;t have an account? <Link href="/signup" className="font-semibold text-[#6C47FF]">Sign up</Link></p>
    </form>
    </>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [f, setF] = React.useState({ name: "", email: "", pw: "", confirm: "", terms: false });
  const [err, setErr] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [creatingTransition, setCreatingTransition] = React.useState(false);
  const [fe, setFe] = React.useState<Partial<Record<"name" | "email" | "pw" | "cpw" | "terms", string>>>({});
  const configured = isSupabaseConfigured();
  const keyMap = { name: "name", email: "email", pw: "pw", confirm: "cpw", terms: "terms" } as const;
  const set = (k: keyof typeof f) => (v: string | boolean) => { setF((s) => ({ ...s, [k]: v })); setFe((s) => ({ ...s, [keyMap[k]]: undefined })); };
  const mismatch = f.confirm.length > 0 && f.pw !== f.confirm;

  React.useEffect(() => { if (configured) preloadSupabase(); }, [configured]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: typeof fe = {};
    if (!f.name.trim()) found.name = "Enter your full name.";
    if (!f.email.trim()) found.email = "Enter your email address."; else if (!emailOk(f.email)) found.email = "Enter a valid email, like you@example.com.";
    if (!f.pw) found.pw = "Create a password."; else if (!assessPasswordStrength(f.pw).isAcceptable) found.pw = assessPasswordStrength(f.pw).reason ?? "Use a stronger password (8+ chars, mixed case, number or symbol).";
    if (!f.confirm) found.cpw = "Re-enter your password."; else if (f.pw !== f.confirm) found.cpw = "Passwords do not match.";
    if (!f.terms) found.terms = "Agree to the Terms of Service and Privacy Policy to continue.";
    setFe(found);
    if (Object.keys(found).length) { setErr(undefined); focusFirstInvalid(); return; }
    setBusy(true); setErr(undefined);
    const { data, error } = await (await createClient()).auth.signUp({
      email: f.email, password: f.pw,
      options: { data: { full_name: f.name.trim() }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setBusy(false); return setErr("We couldn't create your account. Try a different email or password."); }
    setCreatingTransition(true);
    setTimeout(() => {
      router.replace(data.session ? "/dashboard" : "/login?created=1");
    }, 1350);
    return;
  }

  return (
    <>
      {creatingTransition && (
        <AuthTransition
          mode="signup"
          name={f.name}
          email={f.email}
          subtitleOverride={undefined}
        />
      )}
      <form onSubmit={submit} noValidate className="space-y-3.5 [@media(max-height:700px)]:space-y-2.5">
      <div><h2 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">Create Your Account</h2><p className="mt-1 text-sm text-zinc-500">Get started with RelayNest in a few seconds.</p></div>
      {!configured && <DemoNotice />}
      <ErrorBox msg={err} />
      <GoogleSignIn onError={setErr} />
      <Field id="name" label="Full Name" error={fe.name}><IconBox icon={User} ok={f.name.trim().length > 1}><input suppressHydrationWarning id="name" autoComplete="name" value={f.name} aria-invalid={Boolean(fe.name) || undefined} onChange={(e) => set("name")(e.target.value)} className={cn(inputCls, "pl-10 pr-10")} /></IconBox></Field>
      <Field id="email" label="Email Address" error={fe.email}><IconBox icon={Mail} ok={emailOk(f.email)}><input suppressHydrationWarning id="email" type="email" autoComplete="email" value={f.email} aria-invalid={Boolean(fe.email) || undefined} onChange={(e) => set("email")(e.target.value)} className={cn(inputCls, "pl-10 pr-10")} /></IconBox></Field>
      <Field id="pw" label="Password" error={fe.pw}><PasswordInput id="pw" value={f.pw} onChange={set("pw")} autoComplete="new-password" invalid={Boolean(fe.pw)} /></Field>
      <Meter pw={f.pw} />
      <Field id="cpw" label="Confirm Password" error={fe.cpw ?? (mismatch ? "Passwords do not match." : undefined)}><PasswordInput id="cpw" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" invalid={Boolean(fe.cpw) || mismatch} /></Field>
      <Checkbox tone="light" wrapperClassName="items-start" checked={f.terms} onChange={(e) => set("terms")(e.target.checked)} label={<span>I agree to the <Link href="/terms" className="text-[#6C47FF] underline">Terms of Service</Link> and <Link href="/privacy" className="text-[#6C47FF] underline">Privacy Policy</Link>.</span>} />
      {fe.terms && <p role="alert" className="-mt-1.5 flex items-start gap-1 text-xs font-medium text-red-600"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{fe.terms}</p>}
      <button className={btnCls} disabled={busy || !configured}>{busy ? <span className="inline-flex items-center justify-center gap-2"><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />Creating account...</span> : "Sign Up"}</button>
      <p className="text-center text-sm text-zinc-600">Already have an account? <Link href="/login" className="font-semibold text-[#6C47FF]">Log in</Link></p>
    </form>
    </>
  );
}

export function ForgotForm() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "busy" | "sent" | "error">("idle");
  const [msg, setMsg] = React.useState("");
  const configured = isSupabaseConfigured();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setMsg("Enter your email address."); return setState("error"); }
    if (!emailOk(email)) { setMsg("Enter a valid email, like you@example.com."); return setState("error"); }
    setState("busy");
    await (await createClient()).auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
    setState("sent"); // same response whether or not the account exists
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 [@media(max-height:700px)]:space-y-3">
      <div><h2 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">Forgot Password?</h2><p className="mt-1 text-sm text-zinc-500">Enter the email address associated with your RelayNest account.</p></div>
      {!configured && <DemoNotice />}
      {state === "sent" && <div role="status" className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"><Check className="size-4 shrink-0" aria-hidden />If an account exists for that address, a reset link is on its way.</div>}
      <Field id="email" label="Email Address" error={state === "error" ? msg : undefined}><IconBox icon={Mail} ok={emailOk(email)}><input suppressHydrationWarning id="email" type="email" autoComplete="email" value={email} aria-invalid={state === "error" || undefined} onChange={(e) => { setEmail(e.target.value); setState("idle"); }} className={cn(inputCls, "pl-10 pr-10")} /></IconBox></Field>
      <button className={btnCls} disabled={state === "busy" || !configured}>{state === "busy" ? "Sending..." : "Send Reset Link"}</button>
      <Link href="/login" className="flex items-center justify-center gap-2 text-sm font-medium text-[#6C47FF]"><ArrowLeft className="size-4" aria-hidden />Back to Login</Link>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const [pw, setPw] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const [fe, setFe] = React.useState<{ pw?: string; cpw?: string }>({});
  const [busy, setBusy] = React.useState(false);
  const configured = isSupabaseConfigured();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: typeof fe = {};
    if (!pw) found.pw = "Enter a new password."; else if (strength(pw).score < 2) found.pw = "Too weak: use 8+ characters, mixed case, and a number or symbol.";
    if (!confirm) found.cpw = "Re-enter your new password."; else if (pw !== confirm) found.cpw = "Passwords do not match.";
    setFe(found);
    if (found.pw || found.cpw) { setErr(undefined); focusFirstInvalid(); return; }
    setBusy(true); setErr(undefined);
    const { error } = await (await createClient()).auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr("This reset link has expired. Request a new one.");
    router.replace("/dashboard");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 [@media(max-height:700px)]:space-y-3">
      <div><h2 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">Reset Your Password</h2><p className="mt-1 text-sm text-zinc-500">Enter your new password below.</p></div>
      {!configured && <DemoNotice />}
      <ErrorBox msg={err} />
      <Field id="npw" label="New Password" error={fe.pw}><PasswordInput id="npw" value={pw} onChange={(v) => { setPw(v); setFe((s) => ({ ...s, pw: undefined })); }} autoComplete="new-password" invalid={Boolean(fe.pw)} /></Field>
      <Meter pw={pw} />
      <Field id="cnpw" label="Confirm New Password" error={fe.cpw}><PasswordInput id="cnpw" value={confirm} onChange={(v) => { setConfirm(v); setFe((s) => ({ ...s, cpw: undefined })); }} autoComplete="new-password" invalid={Boolean(fe.cpw)} /></Field>
      <button className={btnCls} disabled={busy || !configured}>{busy ? "Saving..." : "Reset Password"}</button>
      <Link href="/login" className="flex items-center justify-center gap-2 text-sm font-medium text-[#6C47FF]"><ArrowLeft className="size-4" aria-hidden />Back to Login</Link>
    </form>
  );
}

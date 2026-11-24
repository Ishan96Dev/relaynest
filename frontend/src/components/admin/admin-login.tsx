"use client";

import { AlertCircle, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const inputCls =
  "h-11 [@media(max-height:700px)]:h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/30 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50/60";
const btnCls =
  "sheen h-11 [@media(max-height:700px)]:h-10 w-full rounded-xl bg-gradient-to-b from-[#7C5CFF] to-[#5B34F0] text-sm font-semibold text-white shadow-[0_10px_24px_-10px_#6C47FF] transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-10px_#6C47FF] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured || busy) return;
    if (!email.trim() || !password) {
      setError("Enter both admin email and password.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const r = await api<{ ok: boolean }>("/api/admin/login", { body: { email, password } });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <AuthShell variant="default" hideSwitch>
      <form onSubmit={submit} noValidate className="space-y-4 [@media(max-height:700px)]:space-y-3">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6C47FF]/25 bg-[#6C47FF]/10 px-3 py-1 text-xs font-bold text-[#6C47FF]">
            <ShieldCheck className="size-3.5" aria-hidden /> Admin Login
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-[28px]">
            Admin Console Sign In
          </h1>
          <p className="text-sm text-zinc-500">
            Platform administrator access only. Workspace accounts cannot sign in here.
          </p>
        </div>

        {!configured && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-bold">Admin credentials not configured yet</p>
              <p className="mt-0.5">
                Set <code className="rounded bg-amber-200/70 px-1">ADMIN_EMAIL</code> and{" "}
                <code className="rounded bg-amber-200/70 px-1">ADMIN_PASSWORD</code> in <code className="rounded bg-amber-200/70 px-1">.env</code>.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="admin-email" className="text-sm font-medium text-zinc-900">
            Admin Email <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              placeholder="admin@relaynest.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(inputCls, "pl-10")}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="admin-pw" className="text-sm font-medium text-zinc-900">
            Admin Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              id="admin-pw"
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter administrator password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(inputCls, "pl-10 pr-11")}
              required
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-800"
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <button type="submit" className={btnCls} disabled={!configured || busy}>
          {busy ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              Verifying Admin Session...
            </span>
          ) : (
            "Admin Log In"
          )}
        </button>

        <p className="text-center text-sm text-zinc-600">
          Looking for your workspace?{" "}
          <Link href="/login" className="font-semibold text-[#6C47FF] hover:underline">
            Go to User Login
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

"use client";

import { Activity, Bell, Check, CheckCircle2, Clock, Eye, EyeOff, KeyRound, Lock, LogOut, Mail, Monitor, Power, QrCode, RefreshCw, ShieldCheck, Smartphone, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { AuthTransition } from "@/components/auth/auth-transition";
import { toast } from "@/components/ui/toast";
import { Badge, ComingSoon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@backend/lib/supabase/lazy";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageTitle } from "@/components/motion/split-text";

const RULES: [string, (p: string) => boolean][] = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["Include an uppercase letter (A-Z)", (p) => /[A-Z]/.test(p)],
  ["Include a lowercase letter (a-z)", (p) => /[a-z]/.test(p)],
  ["Include a number (0-9)", (p) => /\d/.test(p)],
  ["Include a special character (e.g., !@#$%)", (p) => /[^A-Za-z0-9]/.test(p)],
];

function PwInput({ id, value, onChange, autoComplete, ...rest }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; "aria-invalid"?: boolean }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input suppressHydrationWarning id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} aria-invalid={rest["aria-invalid"]} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-border bg-surface-2/80 pl-3 pr-11 text-sm focus:border-lavender focus:outline-none focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger/5 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/25" />
      <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-foreground">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
    </div>
  );
}

const sessions = [
  { dev: "Windows PC", cur: true, browser: "Chrome 142", os: "Windows 11", ip: "106.221.124.90", loc: "Kolkata, IN", last: "Nov 16, 2026, 05:42 PM" },
  { dev: "iPhone 13", browser: "Safari 18", os: "iOS 18", ip: "106.221.124.33", loc: "Kolkata, IN", last: "Nov 15, 2026, 09:14 PM" },
  { dev: "MacBook Pro", browser: "Chrome 141", os: "macOS 15", ip: "49.207.110.21", loc: "Mumbai, IN", last: "Nov 14, 2026, 11:03 AM" },
];
const activity = [
  { ok: true, t: "Successful login", d: "Windows PC \u2022 Chrome 142 \u2022 Kolkata, IN", w: "Nov 16, 2026, 05:42 PM", b: "Success", tone: "success" as const },
  { ok: false, t: "Failed login attempt", d: "Unknown Device \u2022 Chrome \u2022 Kolkata, IN", w: "Nov 16, 2026, 02:17 PM", b: "Failed", tone: "danger" as const },
  { ok: true, t: "Password changed", d: "Windows PC \u2022 Chrome 142", w: "Nov 10, 2026, 03:26 PM", b: "Info", tone: "info" as const },
];

export function SecuritySettings({ demo, userEmail }: { demo: boolean; userEmail?: string }) {
  const router = useRouter();
  const [cur, setCur] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [state, setState] = React.useState<{ kind: "idle" | "saving" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [deletingAccount, setDeletingAccount] = React.useState(false);
  const [sendingCode, setSendingCode] = React.useState(false);
  const [codeSent, setCodeSent] = React.useState(false);
  const [deletedTransition, setDeletedTransition] = React.useState(false);
  React.useEffect(() => {
    if (state.kind === "ok") { toast.success("Password updated"); void fetch("/api/v1/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "password_changed" }) }); }
    else if (state.kind === "error" && state.msg) toast.error(state.msg);
  }, [state]);
  const [alerts, setAlerts] = React.useState({ notify: true, suspicious: true });
  const [signedOut, setSignedOut] = React.useState(false);
  const passed = RULES.map(([, f]) => f(pw));
  const score = passed.filter(Boolean).length;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const [fe, setFe] = React.useState<{ cur?: string; pw?: string; confirm?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return setState({ kind: "error", msg: "Demo mode: connect Supabase to change your password." });
    const found: typeof fe = {};
    if (!cur) found.cur = "Enter your current password.";
    if (!pw) found.pw = "Enter a new password."; else if (score < RULES.length) found.pw = "Meet every requirement listed on the right.";
    if (!confirm) found.confirm = "Re-enter the new password."; else if (pw !== confirm) found.confirm = "Passwords do not match.";
    setFe(found);
    if (Object.keys(found).length) { setState({ kind: "idle" }); requestAnimationFrame(() => document.querySelector<HTMLElement>("input[aria-invalid=\"true\"]")?.focus()); return; }
    setState({ kind: "saving" });
    const sb = await createClient();
    const { data: u } = await sb.auth.getUser();
    if (!u.user?.email) return setState({ kind: "error", msg: "Your session expired. Sign in again." });
    // Re-authenticate so a hijacked session cannot change the password without knowing the current one.
    const { error: authErr } = await sb.auth.signInWithPassword({ email: u.user.email, password: cur });
    if (authErr) return setState({ kind: "error", msg: "Your current password is incorrect." });
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return setState({ kind: "error", msg: "Could not update the password. Try a different one." });
    setCur(""); setPw(""); setConfirm(""); setState({ kind: "ok" });
  }

  async function signOutOthers() {
    if (demo) return;
    const { error } = await (await createClient()).auth.signOut({ scope: "others" });
    if (!error) setSignedOut(true);
  }

  async function sendDeleteVerificationMail() {
    if (demo) return;
    setSendingCode(true);
    try {
      const sb = await createClient();
      const { error } = await sb.auth.reauthenticate();
      if (error) {
        toast.info("Direct DELETE confirmation is active (Supabase email verification skipped for OAuth or unconfigured SMTP).");
      } else {
        setCodeSent(true);
        toast.success(`Verification email sent via Supabase to ${userEmail ?? "your inbox"}`);
      }
    } finally {
      setSendingCode(false);
    }
  }

  async function confirmDeleteAccount() {
    if (demo || deleteConfirm !== "DELETE") return;
    setDeletingAccount(true);
    const res = await api<{ deleted: boolean; confirmationEmailSent: boolean }>("/api/v1/settings/account", {
      method: "DELETE",
      body: { confirmText: "DELETE" },
    });
    if (!res.ok) {
      setDeletingAccount(false);
      return toast.error(res.message);
    }
    try {
      await (await createClient()).auth.signOut();
    } catch {
      /* User already deleted on auth server */
    }
    toast.success(
      res.data.confirmationEmailSent
        ? `Account deleted. Confirmation email sent to ${userEmail ?? "your email"}.`
        : "Account deleted permanently.",
    );
    setDeleteOpen(false);
    setDeletedTransition(true);
    setTimeout(() => {
      router.replace("/login?account=deleted");
      router.refresh();
    }, 900);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {deletedTransition && <AuthTransition mode="signout" name={userEmail ?? "Account"} />}
      <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><ShieldCheck /></IconTile>
        <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Security & Access" /></h1><p className="text-sm text-foreground/80">Protect your account and manage active sessions.</p></div></div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader title="Password Management" description="Update your password to keep your account secure." icon={<KeyRound />} tile />
          <form onSubmit={submit} className="grid-cols-1 grid gap-5 p-5 pt-2 md:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3.5">
              <Field label="Current Password" htmlFor="cpw" required error={fe.cur}><PwInput id="cpw" value={cur} onChange={(v) => { setCur(v); setFe((s) => ({ ...s, cur: undefined })); }} autoComplete="current-password" /></Field>
              <Field label="New Password" htmlFor="npw" required error={fe.pw}><PwInput id="npw" value={pw} onChange={(v) => { setPw(v); setFe((s) => ({ ...s, pw: undefined })); }} autoComplete="new-password" /></Field>
              {pw && (
                <div className="flex items-center gap-3" aria-live="polite"><div className="flex flex-1 gap-1">{[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= Math.ceil((score / RULES.length) * 4) ? (score === RULES.length ? "bg-success" : score >= 3 ? "bg-warning" : "bg-danger") : "bg-foreground/15")} />)}</div>
                  <span className="text-xs text-foreground/80">{score === RULES.length ? "Strong" : score >= 3 ? "Fair" : "Weak"}</span></div>
              )}
              <Field label="Confirm New Password" htmlFor="cnpw" required error={fe.confirm ?? (mismatch ? "Passwords do not match." : undefined)}><PwInput id="cnpw" value={confirm} onChange={(v) => { setConfirm(v); setFe((s) => ({ ...s, confirm: undefined })); }} autoComplete="new-password" /></Field>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="submit" disabled={state.kind === "saving"}><Lock className="size-4" />{state.kind === "saving" ? "Updating..." : "Update Password"}</Button>
                <Button variant="outline" onClick={() => { setCur(""); setPw(""); setConfirm(""); setState({ kind: "idle" }); }}>Cancel</Button>
              </div>
            </div>
            <div className="md:border-l md:border-border md:pl-5">
              <h3 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-lavender" aria-hidden />Password Requirements</h3>
              <ul className="space-y-2.5 text-sm">{RULES.map(([l], i) => <li key={l} className="flex items-start gap-2.5">{passed[i] ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Met" /> : <span className="mt-1 size-3.5 shrink-0 rounded-full border border-muted" aria-label="Not met" />}<span className={passed[i] ? "text-foreground" : "text-foreground/75"}>{l}</span></li>)}</ul>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Two-Factor Authentication (2FA)" description="Add an extra layer of security to your account." icon={<ShieldCheck />} tile action={<ComingSoon />} />
          <div className="space-y-4 px-5 pb-5" aria-disabled="true">
            <div className="flex gap-4"><span className="grid-cols-1 panel grid size-24 shrink-0 place-items-center" aria-hidden><QrCode className="size-14 text-lavender/70" /></span>
              <div><h3 className="font-bold">Authenticator App</h3><p className="text-sm text-foreground/75">Use an authenticator app (e.g., Google Authenticator, Microsoft Authenticator, Authy) to get verification codes.</p>
                <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled><RefreshCw className="size-3.5" />Change 2FA Setup</Button><Button size="sm" variant="danger-outline" disabled><Power className="size-3.5" />Disable 2FA</Button></div></div></div>
            <div className="panel flex items-center gap-3 p-3"><IconTile size="md" tone="primary"><KeyRound /></IconTile><div className="flex-1 leading-tight"><p className="font-bold">Recovery Codes</p><p className="text-xs text-foreground/70">Backup codes to access your account if you lose your device.</p></div><Button size="sm" variant="outline" disabled><Eye className="size-3.5" />View Recovery Codes</Button></div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Active Sessions" description="Manage devices where you're currently signed in." icon={<Monitor />} tile
          action={<Button variant="outline" onClick={signOutOthers} disabled={demo || signedOut} title={demo ? "Connect Supabase to manage sessions." : undefined}><LogOut className="size-4" />{signedOut ? "Other devices signed out" : "Log Out Other Devices"}</Button>} />
        <div className="overflow-x-auto px-5 pb-5">
          {demo ? <Badge tone="warning" className="mb-2">Sample sessions</Badge> : <p className="mb-2 text-xs text-muted">Per-device session details are not available yet. &ldquo;Log Out Other Devices&rdquo; ends every other session.</p>}
          <table className="rn-table min-w-[820px]">
            <thead><tr><th>Device</th><th>Browser</th><th>Operating System</th><th>IP Address</th><th>Location</th><th>Last Active</th><th>Status</th></tr></thead>
            <tbody>{(demo ? sessions : sessions.slice(0, 1)).map((s) => (
              <tr key={s.dev} className={s.cur ? "[&>td]:bg-success/5" : ""}>
                <td><span className="flex items-center gap-2 font-semibold">{s.dev.includes("iPhone") ? <Smartphone className="size-5" aria-hidden /> : <Monitor className="size-5" aria-hidden />}<span>{s.dev}{s.cur && <Badge tone="success" className="ml-2">Current Session</Badge>}</span></span></td>
                <td>{s.browser}</td><td>{s.os}</td><td>{demo ? s.ip : "-"}</td><td>{demo ? s.loc : "-"}</td><td className="text-foreground/85">{demo ? s.last : "Now"}</td>
                <td>{s.cur ? <Badge tone="success" dot>Active</Badge> : <Badge tone="neutral" dot>Inactive</Badge>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid-cols-1 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Login Activity" description="A timeline of recent security events on your account." icon={<Activity />} tile action={demo ? <Badge tone="warning">Sample data</Badge> : <ComingSoon />} />
          <ol className="space-y-3 px-5 pb-5">
            {(demo ? activity : []).map((a) => (
              <li key={a.t} className="flex items-center gap-3"><span className={cn("grid size-8 place-items-center rounded-full border-2", a.ok ? "border-success text-ok" : "border-danger text-bad")} aria-hidden>{a.ok ? <Check className="size-4" /> : <XCircle className="size-4" />}</span>
                <div className="min-w-0 flex-1 leading-tight"><p className="text-sm font-bold">{a.t}</p><p className="truncate text-xs text-foreground/70">{a.d}</p></div><span className="hidden text-xs text-foreground/75 sm:block">{a.w}</span><Badge tone={a.tone}>{a.b}</Badge></li>
            ))}
            {!demo && <li className="text-sm text-muted">A login history is not recorded yet.</li>}
          </ol>
        </Card>
        <Card>
          <CardHeader title="Account Security" description="Configure additional security settings for your account." icon={<Lock />} tile />
          <ul className="divide-y divide-border/50 px-5 pb-4">
            <li className="flex items-center gap-3 py-3"><IconTile size="md" tone="primary"><Bell /></IconTile><div className="flex-1 leading-tight"><p className="font-bold">Security Notifications</p><p className="text-xs text-foreground/70">Get important security updates about your account.</p></div><Switch label="Security notifications" checked={alerts.notify} onCheckedChange={(v) => setAlerts({ ...alerts, notify: v })} /></li>
            <li className="flex items-center gap-3 py-3"><IconTile size="md" tone="primary"><ShieldCheck /></IconTile><div className="flex-1 leading-tight"><p className="font-bold">Suspicious Login Alerts</p><p className="text-xs text-foreground/70">Get notified when a new or unusual login is detected.</p></div><Switch label="Suspicious login alerts" checked={alerts.suspicious} onCheckedChange={(v) => setAlerts({ ...alerts, suspicious: v })} /></li>
            <li className="flex items-center gap-3 py-3"><IconTile size="md" tone="primary"><Clock /></IconTile><div className="flex-1 leading-tight"><label htmlFor="to" className="font-bold">Session Timeout</label><p className="text-xs text-foreground/70">Automatically sign out after a period of inactivity.</p></div><Select id="to" className="w-36" defaultValue="30 minutes" disabled><option>30 minutes</option></Select></li>
          </ul>
        </Card>
      </div>

      {/* Danger Zone: Delete Account + Branded Email Confirmation */}
      <Card className="border-danger/35">
        <CardHeader
          title="Danger Zone · Delete Account"
          description="Permanently delete your RelayNest account, owned workspaces, Telegram bots, workflows, API keys, and trigger an email confirmation."
          icon={<Trash2 />}
          tile
          action={
            <Button
              type="button"
              variant="danger-outline"
              disabled={demo}
              onClick={() => {
                setDeleteConfirm("");
                setCodeSent(false);
                setDeleteOpen(true);
              }}
              title={demo ? "Demo mode: account deletion is disabled." : undefined}
            >
              <Trash2 className="size-4" aria-hidden /> Delete Account
            </Button>
          }
        />
      </Card>

      <Modal
        open={deleteOpen}
        onClose={() => !deletingAccount && setDeleteOpen(false)}
        title="Delete Your RelayNest Account?"
        icon={<IconTile tone="danger" size="md"><Trash2 /></IconTile>}
        footer={
          <>
            <Button variant="outline" disabled={deletingAccount} onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={demo || deletingAccount || deleteConfirm !== "DELETE"}
              onClick={() => void confirmDeleteAccount()}
            >
              <Lock className="size-4" aria-hidden />
              {deletingAccount ? "Deleting..." : "Permanently Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-foreground/85">
          This permanently deletes <strong className="text-foreground">{userEmail ?? "your account"}</strong>, all owned workspaces, connected Telegram bots (also cleared from Telegram), automations, API keys, and uploaded files.
        </p>
        <div className="mt-3 rounded-xl border border-border/70 bg-surface-2/70 p-3 text-xs text-foreground/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-lavender">Account Deletion Email Notification</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={demo || sendingCode || deletingAccount}
              onClick={() => void sendDeleteVerificationMail()}
            >
              <Mail className="size-3.5" aria-hidden />
              {sendingCode ? "Sending..." : codeSent ? "Code Sent via Supabase" : "Send Verification Email"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            Upon deletion, RelayNest also dispatches the branded <code className="text-lavender">account_deleted.html</code> confirmation mail to {userEmail ?? "your email"}.
          </p>
        </div>
        <Input
          aria-label='Type "DELETE" to confirm account deletion'
          placeholder='Type "DELETE" to confirm'
          className="mt-4"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
        />
      </Modal>
    </div>
  );
}

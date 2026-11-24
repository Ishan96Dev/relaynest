"use client";
import { BarChart3, Bot, Calendar, Check, Cpu, CreditCard, Crown, Download, FileText, Info, Layers, QrCode, RefreshCw, Scale, Tag, Users, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import { PageTitle } from "@/components/motion/split-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatMoney, PLANS, priceFor, type Currency, type Cycle, type PlanId } from "@backend/lib/billing/plans";
import type { BillingOverview } from "@backend/server/billing/service";
interface CheckoutResponse {
  kind: "order" | "subscription"; keyId: string; amount: number; currency: string; name: string; description: string; email: string | null;
  orderId?: string; subscriptionId?: string;
}
interface RazorpaySuccess { razorpay_payment_id: string; razorpay_order_id?: string; razorpay_subscription_id?: string; razorpay_signature: string }
interface RazorpayInstance { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void }
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance } }
const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT; s.async = true;
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}
const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" }) : "-");
const planIcon = { free: Crown, pro: Zap, business: Users } as const;
const features: Record<PlanId, string[]> = {
  free: ["Limited bot management (up to 3 bots)", "Basic bot templates", "Basic automation (up to 100 executions/month)", "Basic analytics (7-day history)"],
  pro: ["More bots (up to 20 bots)", "Advanced automation (up to 5,000 executions/month)", "Extended analytics (30-day history)", "Increased API & workflow limits"],
  business: ["Team collaboration (multiple members)", "Higher limits (up to 100 bots)", "Unlimited automation executions", "Priority support"],
};
const compare: [string, string, string, string][] = [["Bots", "Up to 3", "Up to 20", "Up to 100"], ["Automation Executions", "100 / month", "5,000 / month", "Unlimited"], ["Analytics History", "7 days", "30 days", "Custom"], ["Team Members", "1", "Up to 5", "Unlimited"], ["Priority Support", "-", "-", "Included"]];
const statusTone = (s: string) => (s === "active" ? "success" : s === "pending" || s === "halted" ? "warning" : s === "cancelled" ? "danger" : "neutral") as "success" | "warning" | "danger" | "neutral";
function Toggle<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-border p-0.5 text-xs font-semibold">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn("rounded-md px-3 py-1.5", value === v ? "btn-primary-bg text-white" : "text-muted")}>{l}</button>
      ))}
    </div>
  );
}
/** Live billing: plans, Razorpay Checkout, usage against plan limits, payments and invoices. */
export function BillingPanel({ initial }: { initial: BillingOverview }) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [cycle, setCycle] = React.useState<Cycle>(initial.subscription?.billing_cycle ?? "monthly");
  const [currency, setCurrency] = React.useState<Currency>(initial.subscription?.currency ?? "USD");
  const [mode, setMode] = React.useState<"subscription" | "one_time">("subscription");
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("cycle"); if (c === "monthly" || c === "annual") setCycle(c);
    const cur = q.get("currency"); if (cur === "USD" || cur === "INR") setCurrency(cur);
    const m = q.get("mode"); if (m === "subscription" || m === "one_time") setMode(m);
  }, []);
  const [busy, setBusy] = React.useState<PlanId | "cancel" | null>(null);
  const setMessage = (m: { tone: "ok" | "bad"; text: string } | null) => { if (m) toast[m.tone === "ok" ? "success" : "error"](m.text); };
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const sub = data.subscription;
  const paid = data.planId !== "free";
  const recurring = paid && sub?.mode === "recurring" && sub.razorpay_subscription_id;
  const canCancel = Boolean(recurring && data.canManage && !sub?.cancel_at_period_end && sub?.status === "active");
  const [qr, setQr] = React.useState<{ qrId: string; imageUrl: string; amount: number; expiresAt: string; plan: PlanId; state: "pending" | "expired" } | null>(null);
  async function startQr(plan: "pro" | "business", _price: number) {
    setMessage(null); setBusy(plan);
    const res = await api<{ qrId: string; imageUrl: string; amount: number; expiresAt: string }>("/api/v1/billing/upi-qr", { body: { plan, cycle } });
    setBusy(null);
    if (!res.ok) { setMessage({ tone: "bad", text: res.message }); return; }
    setQr({ ...res.data, plan, state: "pending" });
  }
  // While the QR is open, ask the server every 3 seconds whether Razorpay received the payment.
  React.useEffect(() => {
    if (!qr || qr.state !== "pending") return;
    let stop = false;
    const timer = setInterval(async () => {
      const res = await api<{ status: "pending" | "paid" | "expired"; overview: BillingOverview | null }>(`/api/v1/billing/upi-qr/${qr.qrId}`, { method: "GET" });
      if (stop || !res.ok) return;
      if (res.data.status === "paid" && res.data.overview) {
        setData(res.data.overview); setQr(null);
        setMessage({ tone: "ok", text: `Payment received. You are now on the ${res.data.overview.planName} plan. A receipt was sent to your email.` }); router.refresh();
      } else if (res.data.status === "expired" || Date.now() > new Date(qr.expiresAt).getTime()) setQr((q) => (q ? { ...q, state: "expired" } : q));
    }, 3000);
    return () => { stop = true; clearInterval(timer); };
  }, [qr, router]);
  async function pay(plan: "pro" | "business") {
    setMessage(null); setBusy(plan);
    try {
      const res = await api<CheckoutResponse>("/api/v1/billing/checkout", { body: { plan, cycle, currency, mode } });
      if (!res.ok) { setMessage({ tone: "bad", text: res.message }); return; }
      const c = res.data;
      if (!(await loadRazorpay()) || !window.Razorpay) { setMessage({ tone: "bad", text: "Could not load Razorpay Checkout. Check your connection and try again." }); return; }
      const rzp = new window.Razorpay({
        key: c.keyId, name: c.name, description: c.description, theme: { color: "#6C47FF" }, prefill: { email: c.email ?? undefined },
        ...(c.kind === "order" ? { order_id: c.orderId, amount: c.amount, currency: c.currency } : { subscription_id: c.subscriptionId }),
        handler: async (r: RazorpaySuccess) => {
          const v = await api<BillingOverview>("/api/v1/billing/verify", { body: r });
          if (v.ok) { setData(v.data); setMessage({ tone: "ok", text: `You are now on the ${v.data.planName} plan. A receipt was sent to your email.` }); router.refresh(); }
          else setMessage({ tone: "bad", text: `Payment received, but activation is pending: ${v.message} It will activate automatically within a minute.` });
          setBusy(null);
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.on("payment.failed", (r) => { setMessage({ tone: "bad", text: r.error?.description ?? "The payment failed. Please try again." }); setBusy(null); });
      rzp.open();
    } finally {
      // The Checkout window keeps its own state; only unlock the buttons if it never opened.
      setTimeout(() => setBusy((b) => (b && b !== "cancel" && !document.querySelector(".razorpay-container") ? null : b)), 1500);
    }
  }
  async function cancel() {
    setBusy("cancel");
    const res = await api<BillingOverview>("/api/v1/billing/cancel", { body: { atCycleEnd: true } });
    setBusy(null); setConfirmCancel(false);
    if (res.ok) { setData(res.data); setMessage({ tone: "ok", text: "Your subscription will end at the close of the current period. You keep your plan until then." }); router.refresh(); }
    else setMessage({ tone: "bad", text: res.message });
  }
  const u = data.usage;
  const usageRows: { label: string; icon: typeof Bot; used: number; limit: number | null; suffix: string }[] = [
    { label: "Bots", icon: Bot, used: u.bots.used, limit: u.bots.limit, suffix: "" },
    { label: "Automation Executions", icon: Zap, used: u.executions.used, limit: u.executions.limit, suffix: " per month" },
    { label: "AI Tokens", icon: Cpu, used: u.aiTokens.used, limit: null, suffix: " this month" },
  ];
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><CreditCard /></IconTile>
        <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Billing & Subscription" /></h1><p className="text-sm text-foreground/80">Manage your subscription, payment methods, and invoices.</p></div></div>
      {!data.configured && <div role="status" className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"><Info className="size-4 text-warn" aria-hidden />Payments are not set up on this server yet. Add the Razorpay keys to .env to enable upgrades.</div>}
      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[0.9fr_1.5fr]">
        <Card>
          <CardHeader title="Current Plan" icon={<Crown />} tile />
          <div className="space-y-4 p-5 pt-2">
            <div className="panel flex gap-4 p-4">
              <IconTile size="xl" tone="primary" className="size-20 rounded-2xl"><Crown className="!size-10" /></IconTile>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-extrabold">{data.planName} Plan</h3><Badge tone={paid ? statusTone(sub?.status ?? "active") : "neutral"} className="capitalize">{paid ? (sub?.cancel_at_period_end ? "Ends soon" : sub?.status) : "Not Upgraded"}</Badge></div>
                <p className="mt-1 text-sm text-foreground/80">{paid ? (sub?.mode === "one_time" ? "Prepaid for one period. It does not renew." : sub?.cancel_at_period_end || sub?.status === "cancelled" ? "Cancelled. You keep access until the period ends." : "Renews automatically.") : "You're currently on the Free plan."}</p>
                <dl className="grid-cols-1 mt-3 grid grid-cols-2 gap-3 text-sm">
                  {([[Calendar, "Billing Cycle", paid ? (sub?.billing_cycle === "annual" ? "Annual" : "Monthly") : "-"],
                    [Tag, "Price", paid && sub ? `${formatMoney(priceFor(data.planId, sub.billing_cycle, sub.currency), sub.currency)} / ${sub.billing_cycle === "annual" ? "year" : "month"}` : "$0 / month"],
                    [RefreshCw, sub?.mode === "one_time" || sub?.cancel_at_period_end ? "Access Until" : "Next Renewal", paid ? date(sub?.current_period_end) : "-"],
                    [Check, "Status", paid ? (sub?.status ?? "active") : "Free Plan"]] as const).map(([I, l, v]) => (
                    <div key={l} className="flex items-center gap-2"><I className="size-4 text-lavender" aria-hidden /><div className="leading-tight"><dt className="text-[11px] text-muted">{l}</dt><dd className="font-semibold capitalize">{v}</dd></div></div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}><Zap className="size-4" />{paid ? "Change Plan" : "Upgrade Plan"}</Button>
              {canCancel && <Button variant="danger-outline" title="Stop renewing. You keep your plan until the period ends." onClick={() => setConfirmCancel(true)}><X className="size-4" />Cancel Subscription</Button>}
            </div>
            {!data.canManage && <p className="text-xs text-muted">Only workspace owners and admins can change the plan.</p>}
          </div>
        </Card>
        <Card className="scroll-mt-24" >
          <div id="plans" />
          <CardHeader title="Available Plans" description="Choose the right plan for your team and automation needs." icon={<Layers />} tile
            action={<div className="flex flex-wrap items-center justify-end gap-2">
              <Toggle label="Currency" value={currency} onChange={setCurrency} options={[["USD", "USD ($)"], ["INR", "INR (\u20B9)"]]} />
              <Toggle label="Payment type" value={mode} onChange={setMode} options={[["subscription", "Auto-renew"], ["one_time", "One-time (Prepaid)"]]} />
              <Toggle label="Billing period" value={cycle} onChange={setCycle} options={[["monthly", "Monthly"], ["annual", "Annual -20%"]]} />
            </div>} />
          <div className="grid-cols-1 grid gap-3 px-5 pb-5 md:grid-cols-3">
            {(["free", "pro", "business"] as const).map((id) => {
              const Icon = planIcon[id];
              const current = data.planId === id;
              const price = priceFor(id, cycle, currency);
              return (
                <div key={id} className={cn("rounded-2xl border p-4", current ? "border-lavender bg-primary/10 shadow-[0_0_28px_-10px_rgb(var(--rn-primary))]" : "border-border bg-surface-2/60")}>
                  <h3 className="flex items-center gap-2 text-lg font-extrabold"><Icon className="size-5 text-lavender" aria-hidden />{PLANS[id].name}</h3>
                  <p className="mt-1">
                    <span className="text-3xl font-extrabold">{formatMoney(price, currency)}</span>{" "}
                    <span className="text-sm text-foreground/75">
                      {id === "free"
                        ? `/ ${cycle === "annual" ? "year" : "month"}`
                        : mode === "one_time"
                          ? `for 1 ${cycle === "annual" ? "year" : "month"} (no auto-renew)`
                          : `/ ${cycle === "annual" ? "year" : "month"}`}
                    </span>
                  </p>
                  {id !== "free" && cycle === "annual" && (
                    <p className="mt-0.5 text-xs text-ok">{formatMoney(Math.round(price / 12), currency)}/mo equivalent · Save 20%</p>
                  )}
                  <ul className="mt-3 space-y-2 text-[13px]">{features[id].map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />{f}</li>)}</ul>
                  {id === "free" ? (
                    <Button disabled variant="outline" className="mt-4 w-full">{current ? <><Check className="size-4" />Current Plan</> : "Free forever"}</Button>
                  ) : (
                    <>
                      <Button className="mt-4 w-full" variant={current ? "outline" : "primary"} title={!data.configured ? "Payments are not set up on this server yet." : !data.canManage ? "Only workspace owners and admins can change the plan." : mode === "one_time" ? "Pay once for a single period. It does not renew." : "Renews automatically until you cancel."} disabled={!data.configured || !data.canManage || busy !== null || (current && recurring ? sub?.status === "active" && !sub?.cancel_at_period_end : false)} onClick={() => pay(id)}>
                        {busy === id ? "Opening checkout..." : current ? (recurring ? "Current Plan" : "Renew / Extend") : `${mode === "one_time" ? "Buy" : "Upgrade to"} ${PLANS[id].name}`}
                      </Button>
                      {currency === "INR" && (
                        <Button className="mt-2 w-full" variant="outline" title={!data.canManage ? "Only workspace owners and admins can change the plan." : "Scan a QR code with any UPI app. One-time payment, confirmed automatically."} disabled={!data.configured || !data.canManage || busy !== null || qr !== null} onClick={() => startQr(id, price)}>
                          <QrCode className="size-4" />Pay via UPI QR
                        </Button>
                      )}
                    </>

                  )}
                </div>
              );
            })}
          </div>
          <p className="px-5 pb-4 text-[11px] text-muted">Auto-renew charges your card or UPI mandate each period until you cancel. One-time (Prepaid) is the same rate paid once for a single 1-month or 1-year pass and never auto-renews. Payments are processed by Razorpay; RelayNest never stores card details.</p>
        </Card>
      </div>
      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[0.9fr_1.5fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Usage Summary" description="Your current usage and plan limits." icon={<BarChart3 />} tile action={<Badge tone="neutral">{data.planName} Plan Limits</Badge>} />
            <ul className="space-y-2.5 px-5 pb-5">
              {usageRows.map((r) => (
                <li key={r.label} className="panel p-3"><div className="flex items-center gap-3"><r.icon className="size-5 text-lavender" aria-hidden /><span className="flex-1 text-sm font-semibold">{r.label}</span><span className="text-sm tabular-nums">{r.used.toLocaleString("en-US")}{r.limit === null ? "" : ` / ${r.limit.toLocaleString("en-US")}`}{r.suffix}</span></div>
                  {r.limit !== null && <div className="mt-2 h-2 rounded-full bg-foreground/10" role="progressbar" aria-label={r.label} aria-valuenow={r.used} aria-valuemin={0} aria-valuemax={r.limit}><div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${Math.min(100, (r.used / r.limit) * 100)}%` }} /></div>}
                  {r.limit === null && r.label === "Automation Executions" && <p className="mt-1 text-[11px] text-muted">Unlimited on this plan.</p>}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Plan Comparison" description="See what's included in each plan." icon={<Scale />} tile />
            <div className="overflow-x-auto px-5 pb-5"><table className="rn-table min-w-[420px]"><thead><tr><th>Feature</th><th>Free</th><th>Pro</th><th>Business</th></tr></thead>
              <tbody>{compare.map(([f, a, b, c]) => <tr key={f}><td className="font-semibold">{f}</td><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody></table></div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Recent Payments" description="Payments processed by Razorpay." icon={<CreditCard />} tile />
            <div className="overflow-x-auto px-5 pb-5">
              {data.payments.length === 0 ? <p className="py-6 text-center text-sm text-muted">No payments yet.</p> : (
                <table className="rn-table min-w-[560px]"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
                  <tbody>{data.payments.map((p) => (
                    <tr key={p.id as string}><td>{date(p.created_at as string)}</td><td className="capitalize">{p.plan as string}</td><td>{formatMoney(p.amount as number, p.currency as string)}</td>
                      <td className="capitalize">{[p.card_network, p.card_last4 ? `\u2022\u2022\u2022\u2022 ${p.card_last4}` : p.method].filter(Boolean).join(" ") || "-"}</td>
                      <td><Badge tone={p.status === "captured" ? "success" : p.status === "failed" ? "danger" : "warning"} className="capitalize">{p.status as string}</Badge></td></tr>
                  ))}</tbody></table>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Billing History" description="Your invoices and payment receipts." icon={<FileText />} tile />
            <div className="overflow-x-auto px-5 pb-5">
              {data.invoices.length === 0 ? <p className="py-6 text-center text-sm text-muted">Invoices appear here after your first payment.</p> : (
                <table className="rn-table min-w-[560px]"><thead><tr><th>Invoice ID</th><th>Date</th><th>Amount</th><th>Status</th><th>Invoice</th></tr></thead>
                  <tbody>{data.invoices.map((i) => (
                    <tr key={i.id as string}><td className="font-mono text-xs">{i.number as string}</td><td>{date(i.issued_at as string)}</td><td>{formatMoney(i.amount as number, i.currency as string)}</td>
                      <td><Badge tone={i.status === "paid" ? "success" : "neutral"} className="capitalize">{i.status as string}</Badge></td>
                      <td><a href={`/api/v1/billing/invoices/${i.id as string}`} target="_blank" rel="noopener noreferrer" aria-label={`Open invoice ${i.number as string}`} className="grid-cols-1 grid size-8 place-items-center rounded-md border border-border text-muted hover:text-foreground"><Download className="size-4" aria-hidden /></a></td></tr>
                  ))}</tbody></table>
              )}
            </div>
          </Card>
        </div>
      </div>
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel subscription?" icon={<X />}
        footer={<><Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep plan</Button><Button variant="danger" onClick={cancel} disabled={busy === "cancel"}>{busy === "cancel" ? "Cancelling..." : "Cancel at period end"}</Button></>}>
        <p className="text-sm text-foreground/85">Your {data.planName} plan stays active until {date(sub?.current_period_end)}. After that your workspace returns to the Free plan and will not be charged again.</p>
      </Modal>
      <Modal open={qr !== null} onClose={() => setQr(null)} title="Pay with UPI" icon={<QrCode />}
        footer={<Button variant="outline" onClick={() => setQr(null)}>Close</Button>}>
        {qr && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-foreground/85">Scan with any UPI app to pay <strong>{formatMoney(qr.amount, "INR")}</strong> for the {PLANS[qr.plan].name} plan ({cycle === "annual" ? "1 year" : "1 month"}, does not renew).</p>
            {qr.state === "pending" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.imageUrl} alt="UPI QR code" width={240} height={240} className="mx-auto rounded-xl bg-white p-2" />
            ) : (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">This QR expired. Close this window and generate a new one.</p>
            )}
            <p className="text-xs text-muted" role="status">{qr.state === "pending" ? `Waiting for payment... valid until ${new Date(qr.expiresAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}. This updates automatically.` : ""}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

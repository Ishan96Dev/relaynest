import { Errors, route } from "@backend/lib/http/api";
import { formatMoney } from "@backend/lib/billing/plans";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" }) : "");
/** A printable invoice page (use the browser's Print, Save as PDF). Row level security limits it to workspace owners and admins. */
export const GET = route<{ params: Promise<{ invoiceId: string }> }>(async (_req, { params }) => {
  const ctx = await requireAuth();
  const id = uuid.parse((await params).invoiceId);
  const { data: inv } = await ctx.supabase.from("invoices").select("number, description, amount, currency, status, issued_at, period_start, period_end, payment_id").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (!inv) throw Errors.notFound("Invoice");
  const { data: ws } = await ctx.supabase.from("workspaces").select("name").eq("id", ctx.workspaceId).maybeSingle();
  const { data: pay } = inv.payment_id ? await ctx.supabase.from("payments").select("razorpay_payment_id, method, card_network, card_last4").eq("id", inv.payment_id as string).maybeSingle() : { data: null };
  const method = pay ? [pay.card_network, pay.card_last4 ? `ending ${pay.card_last4}` : pay.method].filter(Boolean).join(" ") : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(String(inv.number))}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #ddd;font-size:14px}.r{text-align:right}.muted{color:#666;font-size:13px}.badge{display:inline-block;padding:2px 10px;border-radius:99px;background:#e6f7ee;color:#0a7a3d;font-size:12px;font-weight:700;text-transform:uppercase}@media print{.noprint{display:none}}</style></head><body>
<p class="noprint"><a href="javascript:window.print()">Print or save as PDF</a></p>
<h1>RelayNest</h1><p class="muted">Invoice ${esc(String(inv.number))} &middot; <span class="badge">${esc(String(inv.status))}</span></p>
<p>Billed to: <strong>${esc(String(ws?.name ?? "Workspace"))}</strong><br><span class="muted">Issued ${esc(date(inv.issued_at as string))}</span></p>
<table><thead><tr><th>Description</th><th>Period</th><th class="r">Amount</th></tr></thead><tbody>
<tr><td>${esc(String(inv.description))}</td><td>${esc(date(inv.period_start as string | null))}${inv.period_end ? ` to ${esc(date(inv.period_end as string))}` : ""}</td><td class="r">${esc(formatMoney(inv.amount as number, inv.currency as string))}</td></tr>
<tr><td colspan="2" class="r"><strong>Total</strong></td><td class="r"><strong>${esc(formatMoney(inv.amount as number, inv.currency as string))}</strong></td></tr></tbody></table>
<p class="muted">${pay ? `Paid with ${esc(method)}. Razorpay payment ${esc(String(pay.razorpay_payment_id))}.` : ""}</p></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
});

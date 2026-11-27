"use client";

import { CalendarClock, CheckCircle2, ExternalLink, Loader2, Save, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { AgentBriefingDto } from "@backend/server/services/agent-briefings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { AgentDailyBriefingPreset } from "@/lib/agent-templates";
import { api } from "@/lib/api-client";

const SCHEDULE_PRESETS = [
  { label: "Weekdays 9:00 AM (Pre-Market)", cron: "0 9 * * 1-5" },
  { label: "Daily 8:00 AM (Morning Digest)", cron: "0 8 * * *" },
  { label: "Daily 8:30 AM (Broker Brief)", cron: "30 8 * * *" },
  { label: "Weekdays 4:00 PM (Post-Market)", cron: "0 16 * * 1-5" },
  { label: "Daily 7:00 PM (Evening Recap)", cron: "0 19 * * *" },
] as const;

const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "Asia/Singapore",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
] as const;

/**
 * 1-Click Scheduled Daily Telegram Briefing configurator embedded in the AI Agent Wizard (Step 5).
 * Backed by a real RelayNest scheduled workflow (`trigger.schedule -> action.ai.research -> action.telegram.sendMessage`).
 */
export function AgentBriefingPanel({
  agentId,
  botConnected,
  category,
  defaultBriefing,
  demo = false,
}: {
  agentId: string | null;
  botConnected: boolean;
  category: string;
  defaultBriefing?: AgentDailyBriefingPreset;
  demo?: boolean;
}) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [sendingNow, setSendingNow] = React.useState(false);
  const [briefing, setBriefing] = React.useState<AgentBriefingDto | null>(null);

  const [enabled, setEnabled] = React.useState(false);
  const [cron, setCron] = React.useState(defaultBriefing?.cron ?? "0 9 * * 1-5");
  const [timezone, setTimezone] = React.useState(defaultBriefing?.timezone ?? "Asia/Kolkata");
  const [chatId, setChatId] = React.useState("");
  const [prompt, setPrompt] = React.useState(
    defaultBriefing?.prompt ??
      `Daily ${category} briefing: summarize today's most important live numbers, top updates, and actionable insights in a clean mobile-friendly Telegram format.`,
  );
  const [includeWebSearch, setIncludeWebSearch] = React.useState(true);
  const [includeMarketData, setIncludeMarketData] = React.useState(category === "Finance & Markets");
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (!agentId || demo) return;
    let cancelled = false;
    setLoading(true);
    void api<AgentBriefingDto>(`/api/v1/ai-agents/${agentId}/briefing`).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) return;
      setBriefing(r.data);
      if (r.data.workflowId) {
        setEnabled(r.data.enabled);
        setCron(r.data.cron);
        setTimezone(r.data.timezone);
        setChatId(r.data.chatId);
        if (r.data.prompt) setPrompt(r.data.prompt);
        setIncludeWebSearch(r.data.includeWebSearch);
        setIncludeMarketData(r.data.includeMarketData);
      } else if (r.data.recentChatIds.length > 0) {
        setChatId((prev) => prev || r.data.recentChatIds[0]!);
      }
    });
    return () => { cancelled = true; };
  }, [agentId, demo]);

  async function saveSchedule() {
    if (!agentId || demo || saving) return;
    setError(undefined);
    if (!chatId.trim()) return setError("Enter your Telegram Chat ID or Channel ID first.");
    if (prompt.trim().length < 10) return setError("Describe what this daily briefing should search and report.");

    setSaving(true);
    const r = await api<AgentBriefingDto>(`/api/v1/ai-agents/${agentId}/briefing`, {
      method: "PUT",
      body: {
        enabled,
        cron: cron.trim(),
        timezone,
        chatId: chatId.trim(),
        prompt: prompt.trim(),
        includeWebSearch,
        includeMarketData,
      },
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setBriefing(r.data);
    toast.success(r.data.enabled ? "Daily Telegram briefing schedule is live" : "Daily briefing draft saved");
  }

  async function sendTestNow() {
    if (!agentId || demo || sendingNow) return;
    setError(undefined);
    if (!chatId.trim()) return setError("Enter a Telegram Chat ID to deliver the test briefing.");

    setSendingNow(true);
    const r = await api<{ deliveredCount: number; quotesCount: number; sourcesCount: number; ms: number }>(
      `/api/v1/ai-agents/${agentId}/briefing`,
      {
        method: "POST",
        body: {
          chatId: chatId.trim(),
          prompt: prompt.trim(),
          includeWebSearch,
          includeMarketData,
        },
      },
    );
    setSendingNow(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success(
      `Live briefing sent to Telegram (${r.data.quotesCount} quotes, ${r.data.sourcesCount} sources in ${(r.data.ms / 1000).toFixed(1)}s)`,
    );
  }

  return (
    <section aria-labelledby="briefing-title" className="space-y-3 rounded-2xl border border-lavender/35 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="briefing-title" className="flex items-center gap-2 text-base font-bold">
            <CalendarClock className="size-4 text-lavender" aria-hidden />
            Daily Automated Telegram Briefing
          </h3>
          <p className="text-xs text-muted">
            Automatically search live stocks (NSE/BSE/MSE), land rates, exams, news or sports on a schedule and push a daily digest to Telegram.
          </p>
        </div>
        {briefing?.workflowId && (
          <Badge tone={briefing.enabled ? "success" : "warning"} dot>
            {briefing.enabled ? "Schedule Active" : "Paused"}
          </Badge>
        )}
      </div>

      {!agentId || !botConnected ? (
        <p className="rounded-xl border border-border bg-surface/70 p-3 text-xs text-muted">
          Connect your Telegram bot (Step 1) and save this agent to enable automated daily Telegram briefings.
        </p>
      ) : loading ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading briefing schedule...
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/75 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Enable scheduled delivery</p>
              <p className="text-xs text-muted">
                {briefing?.nextRunAt && enabled
                  ? `Next scheduled run: ${new Date(briefing.nextRunAt).toLocaleString()}`
                  : "Runs automatically via RelayNest's scheduler (local dev + Cloudflare Cron)."}
              </p>
            </div>
            <Switch label="Enable daily briefing schedule" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted">Quick schedule presets</p>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_PRESETS.map((p) => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => setCron(p.cron)}
                  className={
                    cron === p.cron
                      ? "rounded-full border border-lavender bg-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-foreground"
                      : "rounded-full border border-border bg-surface/70 px-2.5 py-0.5 text-[11px] font-semibold text-muted hover:border-lavender/50 hover:text-foreground"
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cron expression" htmlFor="briefing-cron" hint="min hour day month weekday (e.g. 0 9 * * 1-5 = 9 AM weekdays)">
              <Input id="briefing-cron" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 1-5" />
            </Field>
            <Field label="Time zone" htmlFor="briefing-tz" hint="Your local market / briefing timezone.">
              <Select id="briefing-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Telegram Chat ID or Group/Channel ID"
            htmlFor="briefing-chat-id"
            hint="Send any message to your bot on Telegram first and it will appear below, or paste your numeric Chat ID."
          >
            <Input
              id="briefing-chat-id"
              value={chatId}
              onChange={(e) => { setChatId(e.target.value); setError(undefined); }}
              placeholder="e.g. 123456789 or -1001234567890"
            />
            {briefing && briefing.recentChatIds.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted">Recent bot chats:</span>
                {briefing.recentChatIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChatId(id)}
                    className="rounded-md border border-border bg-surface/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-lavender hover:border-lavender"
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field
            label="Daily briefing watchlist & prompt"
            htmlFor="briefing-prompt"
            hint="Specify stocks (NSE/BSE/MSE), localities, exams, teams, or topics to research each day."
          >
            <Textarea
              id="briefing-prompt"
              rows={3}
              maxLength={3000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface/75 px-3 py-2">
              <span className="text-xs font-semibold">Live Web Search</span>
              <Switch label="Include web search in briefing" checked={includeWebSearch} onCheckedChange={setIncludeWebSearch} />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface/75 px-3 py-2">
              <span className="text-xs font-semibold">Live NSE / BSE / MSE Feed</span>
              <Switch label="Include market data in briefing" checked={includeMarketData} onCheckedChange={setIncludeMarketData} />
            </div>
          </div>

          {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={saving || demo} onClick={() => void saveSchedule()}>
                {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
                {saving ? "Saving..." : enabled ? "Save & Activate Schedule" : "Save Briefing Draft"}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={sendingNow || demo} onClick={() => void sendTestNow()}>
                {sendingNow ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                {sendingNow ? "Sending live brief..." : "Send Test Briefing Now"}
              </Button>
            </div>
            {briefing?.workflowId && (
              <Link
                href={`/workflows/${briefing.workflowId}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-lavender hover:underline"
              >
                <Sparkles className="size-3.5" aria-hidden />
                Edit in Workflow Canvas
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            )}
          </div>

          {briefing?.lastRunAt && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <CheckCircle2 className="size-3.5 text-ok" aria-hidden />
              Last run: {new Date(briefing.lastRunAt).toLocaleString()} ({briefing.lastStatus ?? "ok"})
            </p>
          )}
        </div>
      )}
    </section>
  );
}

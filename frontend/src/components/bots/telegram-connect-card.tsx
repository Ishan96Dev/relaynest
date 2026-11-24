"use client";

import { CheckCircle2, ExternalLink, Eye, EyeOff, RefreshCw, Send, ShieldCheck } from "lucide-react";
import * as React from "react";
import { TelegramUsernameChecker } from "@/components/bots/telegram-username-check";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

const TOKEN_RE = /^\d{5,16}:[A-Za-z0-9_-]{30,50}$/;

/**
 * Shared Telegram BotFather connection view used by both Standard Bot and AI Agent Bot wizards,
 * so both journeys have the exact same layout, username availability checker, token reveal toggle, and security tips.
 */
export function TelegramConnectCard({
  token,
  onTokenChange,
  tokenError,
  botName,
  onBotNameChange,
  botNameError,
  botNameReadOnly = false,
  username,
  seedName,
  checking,
  connected,
  onAction,
  actionLabel = "Validate Token",
  checkingLabel = "Validating...",
  connectedTitle = "Connection Successful!",
  connectedSubtitle,
  onRevalidate,
  revalidating = false,
}: {
  token: string;
  onTokenChange: (v: string) => void;
  tokenError?: string;
  botName: string;
  onBotNameChange?: (v: string) => void;
  botNameError?: string;
  botNameReadOnly?: boolean;
  username?: string;
  seedName?: string;
  checking: boolean;
  connected: boolean;
  onAction: () => void;
  actionLabel?: string;
  checkingLabel?: string;
  connectedTitle?: string;
  connectedSubtitle?: string;
  onRevalidate?: () => void;
  revalidating?: boolean;
}) {
  const [reveal, setReveal] = React.useState(false);
  const [wantedUser, setWantedUser] = React.useState(username ?? "");
  const tokenShapeOk = TOKEN_RE.test(token.trim());

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[0.95fr_1.15fr]">
      <div className="panel p-4">
        <h3 className="flex items-center gap-2 font-bold">
          <Send className="size-5 text-info" aria-hidden />
          Create a Bot with BotFather
        </h3>
        <ol className="mt-3 space-y-3 text-sm text-foreground/85">
          {[
            "Open Telegram and search for @BotFather.",
            "Start a chat and send /newbot.",
            "Follow the instructions to set a name and username for your bot.",
            "Copy the Bot Token and paste it here.",
          ].map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/25 text-xs font-bold text-lavender">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <a
          href="https://t.me/BotFather"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold hover:border-lavender/60"
        >
          Open BotFather <ExternalLink className="size-4" aria-hidden />
        </a>

        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Check /newbot username availability</p>
          <p className="mb-2 mt-0.5 text-xs text-foreground/75">Test if a @BotFather username is free before creating it.</p>
          <TelegramUsernameChecker seedName={seedName || botName} value={wantedUser} onChange={setWantedUser} />
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Telegram Bot Token" htmlFor="tg-bot-token" required error={tokenError}>
          <Input
            id="tg-bot-token"
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={token}
            placeholder="123456789:AA..."
            onChange={(e) => onTokenChange(e.target.value)}
            trailing={
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? "Hide token" : "Show token"}
                title={reveal ? "Hide token" : "Show token"}
                className="grid size-7 place-items-center rounded text-muted hover:text-foreground"
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
        </Field>
        {token && !tokenError && (
          tokenShapeOk
            ? <p className="flex items-center gap-1.5 text-xs text-ok"><CheckCircle2 className="size-3.5" aria-hidden />Token format looks valid</p>
            : <p className="text-xs text-warn">Token format looks incorrect.</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Bot Name" htmlFor="tg-bot-name" required error={botNameError}>
            <Input
              id="tg-bot-name"
              value={botName}
              readOnly={botNameReadOnly}
              maxLength={50}
              onChange={(e) => onBotNameChange?.(e.target.value)}
            />
          </Field>
          <Field label="Bot Username" htmlFor="tg-bot-user" hint={connected ? undefined : "Filled after validation"}>
            <Input id="tg-bot-user" readOnly value={username ? `@${username.replace(/^@/, "")}` : ""} placeholder="relay_support_bot" />
          </Field>
        </div>

        {connected ? (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-success/45 bg-success/10 p-3">
            <CheckCircle2 className="size-6 shrink-0 text-ok" aria-hidden />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-bold text-ok">{connectedTitle}</p>
              <p className="truncate text-xs text-foreground/80">{connectedSubtitle ?? `@${username} is connected and ready to configure.`}</p>
            </div>
            {onRevalidate && (
              <Button size="sm" variant="outline" onClick={onRevalidate} disabled={revalidating}>
                <RefreshCw className={revalidating ? "size-3.5 animate-spin" : "size-3.5"} />Re-validate
              </Button>
            )}
          </div>
        ) : (
          <Button type="button" onClick={onAction} disabled={checking} variant="outline">
            {checking ? checkingLabel : actionLabel}
          </Button>
        )}

        <div className="panel flex gap-3 p-3 text-xs text-foreground/80">
          <ShieldCheck className="size-5 shrink-0 text-lavender" aria-hidden />
          <div>
            <p className="mb-0.5 font-bold text-foreground">Security Tips</p>
            Keep your bot token private and never share it publicly. It is encrypted on our servers, and owners/admins can reveal it later in Bot Settings.
          </div>
        </div>
      </div>
    </div>
  );
}

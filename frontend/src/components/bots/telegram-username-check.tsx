"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";

interface CheckState {
  loading: boolean;
  status?: "available" | "taken" | "invalid" | "unknown";
  problem?: string | null;
  suggestions?: string[];
}

/** Shared @BotFather /newbot username availability checker with clickable suggestions. */
export function TelegramUsernameChecker({
  seedName,
  value,
  onChange,
  onPickSuggestion,
}: {
  seedName?: string;
  value: string;
  onChange: (v: string) => void;
  onPickSuggestion?: (s: string) => void;
}) {
  const [state, setState] = React.useState<CheckState>({ loading: false });

  async function runCheck(candidate?: string) {
    const raw = (candidate ?? value).trim().replace(/^@/, "");
    const stem = (seedName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "my_relay";
    const q = raw || `${stem}_bot`;
    onChange(q);
    setState({ loading: true });
    const res = await api<{ username: string; status: CheckState["status"]; problem: string | null; suggestions: string[] }>(
      `/api/v1/bots/username-check?username=${encodeURIComponent(q)}&name=${encodeURIComponent(seedName || q)}`,
      { method: "GET" },
    );
    if (!res.ok) {
      setState({ loading: false });
      toast.error(res.message);
      return;
    }
    setState({ loading: false, status: res.data.status, problem: res.data.problem, suggestions: res.data.suggestions });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          aria-label="Desired bot username"
          placeholder="my_shop_bot"
          value={value}
          onChange={(e) => { onChange(e.target.value.replace(/^@/, "")); setState((s) => ({ ...s, status: undefined })); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runCheck(); } }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void runCheck()} disabled={state.loading} className="h-10 shrink-0">
          {state.loading ? "Checking..." : "Check"}
        </Button>
      </div>
      {state.status === "available" && (
        <p className="flex items-center gap-1.5 text-xs text-ok">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          <span>@{value} looks available on Telegram! Use it in @BotFather.</span>
        </p>
      )}
      {(state.status === "taken" || state.status === "invalid" || state.status === "unknown") && (
        <p className="flex items-center gap-1.5 text-xs text-warn">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>
            {state.status === "taken" ? `@${value} is already taken on Telegram.` : state.problem || "Could not confirm availability."}
          </span>
        </p>
      )}
      {state.suggestions && state.suggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted">Available suggestions (click to use &amp; copy):</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {state.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onChange(s);
                  onPickSuggestion?.(s);
                  setState({ loading: false, status: "available", suggestions: [] });
                  navigator.clipboard?.writeText(s);
                  toast.success(`Selected & copied @${s}`);
                }}
                className="rounded-md border border-lavender/40 bg-primary/10 px-2 py-1 text-xs font-medium text-lavender transition hover:bg-primary/20"
              >
                @{s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

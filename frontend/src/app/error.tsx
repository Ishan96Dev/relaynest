"use client";

import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function RootErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    void fetch("/api/admin/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: error.message || "Unhandled frontend error",
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-12">
      <Card glow className="w-full max-w-lg p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo href="/" /></div>
        <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-danger/40 bg-danger/15 text-bad">
          <AlertTriangle className="size-8" aria-hidden />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-bad">500 &middot; Application Error</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          An unexpected error occurred while loading this page. Try again or return to your workspace.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted">Ref: {error.digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}><RotateCcw className="size-4" />Try Again</Button>
          <ButtonLink href="/dashboard" variant="outline"><Home className="size-4" />Dashboard</ButtonLink>
        </div>
      </Card>
    </div>
  );
}

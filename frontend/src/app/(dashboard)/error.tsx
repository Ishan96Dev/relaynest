"use client";

import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import * as React from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    void fetch("/api/admin/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: error.message || "Dashboard error",
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <Card glow className="p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-danger/40 bg-danger/15 text-bad">
          <AlertTriangle className="size-7" aria-hidden />
        </span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-bad">Unexpected Error</p>
        <h1 className="mt-1 text-2xl font-extrabold">Could not load this view</h1>
        <p className="mt-2 text-sm text-muted">{error.message || "Please try again or head back to Overview."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}><RotateCcw className="size-4" />Retry</Button>
          <ButtonLink href="/dashboard" variant="outline"><Home className="size-4" />Overview</ButtonLink>
        </div>
      </Card>
    </div>
  );
}

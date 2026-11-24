import { Bot, Compass, Home } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card glow className="p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-lavender/40 bg-primary/15 text-lavender">
          <Compass className="size-7" aria-hidden />
        </span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-lavender">404 &middot; Not Found</p>
        <h1 className="mt-1 text-2xl font-extrabold">We couldn&apos;t find that resource</h1>
        <p className="mt-2 text-sm text-muted">The bot, workflow, or page you requested does not exist or belongs to another workspace.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/dashboard"><Home className="size-4" />Overview</ButtonLink>
          <ButtonLink href="/bots" variant="outline"><Bot className="size-4" />My Bots</ButtonLink>
        </div>
      </Card>
    </div>
  );
}

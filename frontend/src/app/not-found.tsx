import { ArrowLeft, Compass, Home, Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFoundPage() {
  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-12">
      <div className="orb -left-24 top-16 -z-10 size-[320px] bg-primary" aria-hidden />
      <div className="orb -right-24 bottom-16 -z-10 size-[300px] bg-info" aria-hidden />
      <Card glow className="w-full max-w-lg p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo href="/" /></div>
        <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-lavender/40 bg-primary/15 text-lavender">
          <Compass className="size-8" aria-hidden />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-lavender">Error 404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          The page you are looking for does not exist, was moved, or you do not have access to it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/dashboard"><Home className="size-4" />Go to Dashboard</ButtonLink>
          <ButtonLink href="/" variant="outline"><ArrowLeft className="size-4" />Home</ButtonLink>
          <ButtonLink href="/docs" variant="ghost"><Search className="size-4" />Docs</ButtonLink>
        </div>
      </Card>
    </div>
  );
}

import { ArrowRight, Code2, KeyRound, Puzzle } from "lucide-react";
import { buildOpenApiSpec } from "@backend/lib/api/openapi";
import { publicEnv } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { SwaggerExplorer } from "@/components/marketing/swagger-explorer";
import { PageTitle } from "@/components/motion/split-text";
import { ButtonLink } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata = { title: "API & Swagger UI" };
export const dynamic = "force-dynamic";

export default async function WorkspaceApiDocsPage() {
  try {
    await requireAuth();
  } catch {
    /* Client/Demo fallback if unauthenticated in offline mode */
  }

  const initialSpec = buildOpenApiSpec(publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, ""));

  return (
    <div className="mx-auto max-w-[1320px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconTile size="xl" className="rounded-full"><Code2 /></IconTile>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="API & Swagger UI" /></h1>
            <p className="text-sm text-foreground/80">
              Explore live OpenAPI 3.1 endpoints, authorize with your workspace Bearer API key, copy code snippets, and test live calls.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/settings/api-keys" size="md">
            <KeyRound className="size-4" aria-hidden /> Manage API Keys
          </ButtonLink>
          <ButtonLink href="/integrations" variant="outline" size="md">
            <Puzzle className="size-4" aria-hidden /> Integrations
          </ButtonLink>
          <ButtonLink href="/docs#api-integrations" variant="outline" size="md">
            API Docs <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </div>

      <SwaggerExplorer initialSpec={initialSpec} />
    </div>
  );
}

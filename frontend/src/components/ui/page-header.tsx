import Image from "next/image";
import { PageTitle } from "@/components/motion/split-text";
import { cn } from "@/lib/utils";
import { IconTile } from "./icon-tile";

/**
 * Page title block. Mockups show either a plain gradient headline (dashboard) or an icon tile +
 * title (settings pages), optionally with a decorative illustration on the right.
 */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  illustration,
  className,
}: {
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  illustration?: { src: string; width: number; height: number };
  className?: string;
}) {
  return (
    <div className={cn("relative mb-6 flex flex-wrap items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-4">
        {icon && <IconTile size="xl" animate="float" className="rounded-full">{icon}</IconTile>}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{typeof title === "string" ? <PageTitle text={title} /> : title}</h1>
          {description && <p className="mt-1 text-sm text-muted sm:text-[15px]">{description}</p>}
        </div>
      </div>
      {illustration && (
        <Image
          src={illustration.src}
          alt=""
          width={illustration.width}
          height={illustration.height}
          priority
          className="pointer-events-none absolute right-0 top-1/2 -z-10 hidden h-auto max-h-28 w-auto -translate-y-1/2 opacity-95 fade-edges lg:block xl:right-24"
        />
      )}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  image,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  image?: { src: string; width: number; height: number };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      {image ? (
        <Image src={image.src} alt="" width={image.width} height={image.height} className="h-auto w-44 fade-edges" />
      ) : (
        icon && <div className="rn-icon-float text-lavender">{icon}</div>
      )}
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}

/* Bot avatars are small Supabase Storage images, so next/image optimisation adds nothing. */
/* eslint-disable @next/next/no-img-element */
import { Bell, BookOpen, Bot, Filter, Headphones, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUCKETS, publicStorageUrl } from "@backend/lib/supabase/storage";

const kinds = [
  { match: "Support", Icon: Headphones, cls: "bg-info/25 text-sky ring-info/40" },
  { match: "Community", Icon: Users, cls: "bg-info/25 text-sky ring-info/40" },
  { match: "Notify", Icon: Bell, cls: "bg-info/25 text-sky ring-info/40" },
  { match: "Lead", Icon: Filter, cls: "bg-foreground/10 text-foreground/80 ring-foreground/15" },
  { match: "FAQ", Icon: BookOpen, cls: "bg-primary/25 text-lavender ring-primary/40" },
] as const;

export function BotAvatar({ name, avatarPath, className }: { name: string; avatarPath?: string | null; className?: string }) {
  const url = publicStorageUrl(BUCKETS.avatars, avatarPath);
  const k = kinds.find((x) => name.includes(x.match));
  const Icon = k?.Icon ?? Bot;
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-inset", k?.cls ?? "bg-primary/25 text-lavender ring-primary/40", className)} aria-hidden>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Icon className="size-[52%]" />}
    </span>
  );
}

/* Small static brand marks served from /public; next/image optimisation adds nothing for these. */
/* eslint-disable @next/next/no-img-element */
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

/**
 * Brand marks live in /public/images/providers. Sources: the LobeHub icon set (jsDelivr, @lobehub/icons-static-svg)
 * for NVIDIA, Google, Meta, Mistral, Moonshot (Kimi), Z.ai, MiniMax and Reflection, and each company's own site icon for
 * Parallel and Humans&. Stealth is an anonymous provider with no mark. Logos are trademarks of their owners.
 */
const LOGOS: Record<string, string> = {
  nvidia: "/images/providers/nvidia.svg",
  google: "/images/providers/google.svg",
  meta: "/images/providers/meta.svg",
  mistral: "/images/providers/mistral.svg",
  moonshot: "/images/providers/moonshot.svg",
  zai: "/images/providers/zai.svg",
  minimax: "/images/providers/minimax.svg",
  reflection: "/images/providers/reflection.svg",
  blackforest: "/images/providers/blackforest.svg",
  parallel: "/images/providers/parallel.svg",
  humansand: "/images/providers/humansand.png",
};

const tones: Record<string, TileTone> = { stealth: "neutral" };
const letters = (name: string) => name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "AI";

const box = {
  sm: "size-6 rounded-md p-1",
  avatar: "size-8 rounded-full p-1.5",
  md: "size-10 rounded-xl p-1.5",
  lg: "size-12 rounded-xl p-2",
} as const;

/** Provider logo on a white tile (readable in both themes), or a monogram tile when no logo exists. */
export function ProviderMark({ providerKey, name, size = "md", className }: { providerKey: string; name: string; size?: "sm" | "avatar" | "md" | "lg"; className?: string }) {
  const src = LOGOS[providerKey];
  if (!src) {
    return (
      <IconTile
        tone={tones[providerKey] ?? "primary"}
        size={size === "avatar" ? "sm" : size}
        className={cn(
          "font-extrabold tracking-tight",
          size === "sm" ? "text-[10px]" : size === "avatar" ? "rounded-full text-[11px]" : "text-sm",
          className,
        )}
      >
        {letters(name)}
      </IconTile>
    );
  }
  return (
    <span
      title={name}
      className={cn("grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-black/10", box[size], className)}
    >
      <img src={src} alt={`${name} logo`} className="size-full object-contain" draggable={false} loading="lazy" />
    </span>
  );
}

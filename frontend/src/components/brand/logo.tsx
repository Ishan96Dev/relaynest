import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/", size = 36, iconOnly }: { className?: string; href?: string; size?: number; iconOnly?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5 font-extrabold tracking-tight", className)} aria-label="RelayNest home">
      <Image src="/brand/logo-icon-128.png" alt="" width={size} height={size} className="rounded-xl transition-transform duration-500 group-hover:rotate-[8deg] group-hover:scale-110" priority />
      {!iconOnly && <span className="text-[22px] leading-none">RelayNest</span>}
    </Link>
  );
}
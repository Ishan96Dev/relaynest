import { MarketingFooter, MarketingHeader } from "@/components/marketing/chrome";
import { RouteProgress } from "@/components/motion/route-progress";
import { ScrollProgress } from "@/components/motion/scroll-progress";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white focus:shadow-xl"
      >
        Skip to main content
      </a>
      <RouteProgress />
      <ScrollProgress />
      <MarketingHeader />
      <main id="main" tabIndex={-1} className="overflow-x-clip focus:outline-none">
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}

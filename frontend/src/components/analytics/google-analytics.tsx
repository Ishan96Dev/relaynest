"use client";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import * as React from "react";
import { Button } from "@/components/ui/button";
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const KEY = "rn:analytics-consent";
type Consent = "granted" | "denied";
type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag } }
const consentFlags = (c: Consent) => ({ analytics_storage: c, ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
/** Sends a page_view whenever the route changes (Next.js navigations do not reload the page, so GA cannot see them by itself). */
function PageViews() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  React.useEffect(() => {
    if (!GA_ID || !window.gtag) return;
    window.gtag("event", "page_view", { page_path: pathname + (search ? `?${search}` : ""), page_location: window.location.href, page_title: document.title });
  }, [pathname, search]);
  return null;
}
/**
 * Google Analytics 4 with Consent Mode v2. Nothing renders unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
 * Analytics storage starts denied; visitors choose in the banner and the choice is remembered in localStorage.
 */
export function GoogleAnalytics() {
  const [choice, setChoice] = React.useState<Consent | null | undefined>(undefined);
  React.useEffect(() => {
    const saved = localStorage.getItem(KEY);
    setChoice(saved === "granted" || saved === "denied" ? saved : null);
  }, []);
  function decide(c: Consent) {
    localStorage.setItem(KEY, c);
    setChoice(c);
    window.gtag?.("consent", "update", consentFlags(c));
  }
  if (!GA_ID) return null;
  return (
    <>
      <Script id="ga-consent" strategy="afterInteractive">{`
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
var saved=null;try{saved=localStorage.getItem(${JSON.stringify(KEY)})}catch(e){}
gtag('consent','default',{analytics_storage:saved==='granted'?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)},{send_page_view:false});`}</Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} strategy="afterInteractive" />
      <React.Suspense fallback={null}><PageViews /></React.Suspense>
      {choice === null && (
        <div role="dialog" aria-label="Analytics cookies" className="fixed bottom-4 left-4 z-[60] w-[min(92vw,380px)] rounded-2xl border border-border bg-surface/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 size-5 shrink-0 text-lavender" aria-hidden />
            <div className="text-sm leading-snug">
              <p className="font-bold">Help us improve RelayNest</p>
              <p className="mt-1 text-foreground/80">Allow anonymous analytics cookies so we can see which pages are used. See our <Link href="/privacy" className="font-semibold text-lavender underline">privacy policy</Link>.</p>
              <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => decide("granted")}>Accept</Button><Button size="sm" variant="outline" onClick={() => decide("denied")}>Decline</Button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

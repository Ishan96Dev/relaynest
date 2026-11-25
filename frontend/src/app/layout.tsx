import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { Toaster } from "@/components/ui/toast";
import { TooltipLayer } from "@/components/ui/tooltip-layer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "RelayNest | Build Bots. Automate Tasks. Connect Everything.", template: "%s | RelayNest" },
  description:
    "RelayNest is a no-code Telegram bot builder and workflow automation platform. Create bots, automate tasks, and monitor everything from one workspace.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-32x32.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: { images: ["/brand/og-image.png"], siteName: "RelayNest", type: "website" },
  twitter: { card: "summary_large_image", images: ["/brand/og-image.png"] },
};

export const viewport: Viewport = { themeColor: "#08081A" };

const themeScript = `try{var d=document.documentElement;d.classList.add("js");var p=JSON.parse(localStorage.getItem("rn:preferences")||"{}");var t=p.theme||localStorage.getItem("rn-theme")||"dark";if(t==="light"||(t==="system"&&!matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("light");if(p.reduceMotion)d.classList.add("reduce-motion");if(p.highContrast)d.classList.add("high-contrast");if(p.compact)d.classList.add("compact-ui");if(p.keyHints===false)d.classList.add("hide-key-hints");if(p.density)d.dataset.density=p.density}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>{children}<TooltipLayer /><Toaster /><GoogleAnalytics /></body>
    </html>
  );
}

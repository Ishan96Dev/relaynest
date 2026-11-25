"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { usePreferences } from "@/components/providers/preferences-provider";

export function ThemeToggle() {
  const { prefs, setThemeAndSync } = usePreferences();
  const [systemDark, setSystemDark] = React.useState(true);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isLight = prefs.theme === "light" || (prefs.theme === "system" && !systemDark);

  return (
    <button
      type="button"
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      onClick={() => void setThemeAndSync(isLight ? "dark" : "light")}
      className="grid-cols-1 grid size-10 place-items-center rounded-lg text-foreground/90 hover:bg-foreground/5"
    >
      {isLight ? <Moon className="size-5" /> : <Sun className="size-5" />}
    </button>
  );
}

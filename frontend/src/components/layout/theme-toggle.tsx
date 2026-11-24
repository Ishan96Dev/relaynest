"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { applyTheme } from "@/lib/theme";

export function ThemeToggle() {
  const [light, setLight] = React.useState(false);
  React.useEffect(() => setLight(document.documentElement.classList.contains("light")), []);
  return (
    <button
      type="button"
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      onClick={() => { const next = !light; applyTheme(next ? "light" : "dark"); setLight(next); }}
      className="grid-cols-1 grid size-10 place-items-center rounded-lg text-foreground/90 hover:bg-foreground/5"
    >
      {light ? <Moon className="size-5" /> : <Sun className="size-5" />}
    </button>
  );
}
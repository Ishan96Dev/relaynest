export type ThemeChoice = "dark" | "light" | "system";

/** Applies the theme class on <html> and persists the choice. Safe to call from client code only. */
export function applyTheme(choice: ThemeChoice) {
  const light = choice === "light" || (choice === "system" && !matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("light", light);
  try { localStorage.setItem("rn-theme", choice); } catch { /* storage unavailable */ }
}

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem("rn-theme");
    return t === "light" || t === "system" ? t : "dark";
  } catch { return "dark"; }
}
// Color theme: "auto" follows the system; "light"/"dark" are stored per device.

export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_KEY = "xw:theme";

/**
 * Inline script for <head>: applies a stored choice before the first paint, so a page never
 * flashes the wrong theme. Kept tiny and dependency-free.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function readTheme(): ThemeChoice {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

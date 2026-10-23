// Display density: font and control size, stored per device like the theme.

export type DensityChoice = "normal" | "cosy" | "compact";

export const DENSITY_KEY = "xw:density";

/** Inline script for <head>: applies a stored density before the first paint. */
export const DENSITY_BOOT_SCRIPT = `try{var d=localStorage.getItem("${DENSITY_KEY}");if(d==="cosy"||d==="compact")document.documentElement.dataset.density=d}catch(e){}`;

export function readDensity(): DensityChoice {
  try {
    const d = window.localStorage.getItem(DENSITY_KEY);
    return d === "cosy" || d === "compact" ? d : "normal";
  } catch {
    return "normal";
  }
}

export function applyDensity(choice: DensityChoice): void {
  const root = document.documentElement;
  if (choice === "normal") delete root.dataset.density;
  else root.dataset.density = choice;
  try {
    if (choice === "normal") window.localStorage.removeItem(DENSITY_KEY);
    else window.localStorage.setItem(DENSITY_KEY, choice);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

// Light/dark theme. "system" follows the OS setting; "light" and "dark" override it.
// The choice lives in this browser only, like everything else the app remembers.

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "fft-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Runs inline in <head> before the first paint, so the page never flashes the wrong theme.
// Keep it in sync with applyTheme below.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export function loadTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice lasts for this visit.
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "system" && matchMedia(DARK_QUERY).matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

// Calls back when the OS switches between light and dark.
export function onSystemThemeChange(callback: () => void): () => void {
  const query = matchMedia(DARK_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

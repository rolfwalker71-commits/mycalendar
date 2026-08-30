export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "kalender-theme";

export function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem(THEME_KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function isDarkTheme(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const dark = isDarkTheme(theme);
  document.documentElement.classList.toggle("dark", dark);
  const chrome = document.documentElement.dataset.chrome;
  const color =
    chrome === "android"
      ? dark
        ? "#141218"
        : "#f7f2fa"
      : chrome === "desktop"
        ? dark
          ? "#202020"
          : "#f3f3f3"
        : dark
          ? "#1c1c1e"
          : "#ffffff";
  document.getElementById("theme-color")?.setAttribute("content", color);
}

export function persistTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export type AppPlatform = "ios" | "android" | "desktop";
export type ChromeStyle = AppPlatform;

export const CHROME_KEY = "kalender-chrome";

export const CHROME_OPTIONS: { value: ChromeStyle; label: string; hint: string }[] = [
  { value: "ios", label: "iOS", hint: "Schwebende Inseln, SF-ähnlich, starke Rundungen" },
  {
    value: "android",
    label: "Android",
    hint: "Material You 3 Expressive — folgt Hell/Dunkel, nicht der Wallpaper-Farbe",
  },
  { value: "desktop", label: "Windows", hint: "Fluent 2 — Mica-ähnlich, Accent-Linie, eckiger" },
];

export function detectAppPlatform(): AppPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function readChromeStyle(): ChromeStyle {
  if (typeof window === "undefined") return "desktop";
  const value = window.localStorage.getItem(CHROME_KEY);
  if (value === "ios" || value === "android" || value === "desktop") return value;
  return detectAppPlatform();
}

export function applyChromeStyle(style: ChromeStyle): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.chrome = style;
}

export function persistChromeStyle(style: ChromeStyle): void {
  window.localStorage.setItem(CHROME_KEY, style);
  applyChromeStyle(style);
}

export function isIslandChrome(style: ChromeStyle): boolean {
  return style === "ios";
}

export function dockBarClass(style: ChromeStyle): string {
  if (style === "ios") {
    return "rounded-2xl bg-card p-1 shadow-lg shadow-black/10 ring-1 ring-border";
  }
  if (style === "android") {
    return "rounded-none border-t border-transparent bg-[var(--surface-container)] p-0 shadow-none ring-0";
  }
  return "rounded-none border-t border-border bg-card/80 p-0 shadow-none ring-0 backdrop-blur-xl";
}

export function dockItemClass(style: ChromeStyle, active: boolean): string {
  const hit = style === "ios" ? "min-h-11 rounded-xl" : "min-h-11 rounded-md";
  return `${hit} h-auto flex-1 flex-col gap-0.5 px-1 py-1.5 text-[0.8125rem] whitespace-normal leading-none ${
    active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
  }`;
}

export function listTileClass(style: ChromeStyle): string {
  if (style === "ios") return "rounded-2xl shadow-lg shadow-black/10 ring-1 ring-border";
  if (style === "android") return "rounded-3xl shadow-none ring-0";
  return "rounded-md shadow-none ring-1 ring-border/80";
}

export function panelClass(style: ChromeStyle): string {
  return `bg-card ${listTileClass(style)}`;
}

export function fabClass(style: ChromeStyle): string {
  if (style === "ios") return "size-14 rounded-full shadow-lg";
  if (style === "android") return "size-16 rounded-[1.75rem] shadow-md";
  return "size-12 rounded-md shadow-sm";
}

/** Space above the bottom chrome so the FAB stays clear of the docks. */
export function fabClearance(style: ChromeStyle, docks: 1 | 2): string {
  if (style === "ios") {
    return docks === 2
      ? "calc(10.25rem + env(safe-area-inset-bottom))"
      : "calc(5.5rem + env(safe-area-inset-bottom))";
  }
  if (style === "android") {
    return docks === 2
      ? "calc(10.5rem + env(safe-area-inset-bottom))"
      : "calc(5.75rem + env(safe-area-inset-bottom))";
  }
  return docks === 2
    ? "calc(8.25rem + env(safe-area-inset-bottom))"
    : "calc(4.25rem + env(safe-area-inset-bottom))";
}

export function chromeThemeColor(style: ChromeStyle, dark: boolean): string {
  if (style === "android") return dark ? "#141218" : "#f7f2fa";
  if (style === "desktop") return dark ? "#202020" : "#f3f3f3";
  return dark ? "#1c1c1e" : "#ffffff";
}

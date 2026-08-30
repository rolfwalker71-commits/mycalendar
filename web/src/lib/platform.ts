export type AppPlatform = "ios" | "android" | "desktop";
export type ChromeStyle = AppPlatform;

export const CHROME_KEY = "kalender-chrome";

export const CHROME_OPTIONS: { value: ChromeStyle; label: string; hint: string }[] = [
  { value: "ios", label: "iOS", hint: "Schwebende Inseln, starke Rundungen" },
  { value: "android", label: "Android", hint: "Flache Leisten, Material-ähnlich" },
  { value: "desktop", label: "Windows", hint: "Eckiger, flacher Desktop-Look" },
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
    return "rounded-none border-t border-border bg-background p-0 shadow-none ring-0";
  }
  return "rounded-none border-t border-border bg-card p-0.5 shadow-none ring-0";
}

export function dockItemClass(style: ChromeStyle, active: boolean): string {
  const hit =
    style === "ios" ? "min-h-11 rounded-xl" : style === "android" ? "min-h-12 rounded-lg" : "min-h-11 rounded-md";
  return `${hit} h-auto flex-1 flex-col gap-0.5 px-1 py-1.5 text-[0.8125rem] whitespace-normal leading-none ${
    active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
  }`;
}

export function listTileClass(style: ChromeStyle): string {
  if (style === "ios") return "rounded-2xl shadow-lg shadow-black/10 ring-1 ring-border";
  if (style === "android") return "rounded-lg shadow-sm ring-1 ring-border/70";
  return "rounded-md shadow-sm ring-1 ring-border/60";
}

export function panelClass(style: ChromeStyle): string {
  return `bg-card ${listTileClass(style)}`;
}

/** Space above the bottom chrome so the FAB stays clear of the docks. */
export function fabClearance(style: ChromeStyle, docks: 1 | 2): string {
  if (style === "ios") {
    return docks === 2
      ? "calc(10.25rem + env(safe-area-inset-bottom))"
      : "calc(5.5rem + env(safe-area-inset-bottom))";
  }
  return docks === 2
    ? "calc(8.75rem + env(safe-area-inset-bottom))"
    : "calc(4.5rem + env(safe-area-inset-bottom))";
}

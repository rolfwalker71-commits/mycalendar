const FONT_SCALE_KEY = "app-font-scale";

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.35;
export const FONT_SCALE_STEP = 0.05;
export const FONT_SCALE_DEFAULT = 1;

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return FONT_SCALE_DEFAULT;
  const stepped = Math.round(value / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Number(stepped.toFixed(2))));
}

export function readFontScale(): number {
  if (typeof window === "undefined") return FONT_SCALE_DEFAULT;
  const raw = window.localStorage.getItem(FONT_SCALE_KEY);
  if (raw == null || raw === "") return FONT_SCALE_DEFAULT;
  return clampFontScale(Number(raw));
}

export function applyFontScale(scale: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--app-font-scale", String(clampFontScale(scale)));
}

export function persistFontScale(scale: number): void {
  const next = clampFontScale(scale);
  window.localStorage.setItem(FONT_SCALE_KEY, String(next));
  applyFontScale(next);
}

export function fontScalePercent(scale: number): string {
  return `${Math.round(clampFontScale(scale) * 100)} %`;
}

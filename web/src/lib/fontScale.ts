const FONT_SCALE_KEY = "app-font-scale";
const FOLLOW_SYSTEM_KEY = "app-font-follow-system";

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.35;
export const FONT_SCALE_STEP = 0.05;
export const FONT_SCALE_DEFAULT = 1;

/** iOS body size at the default Dynamic Type setting ("Large"). */
const APPLE_BODY_DEFAULT_PX = 17;
const SYSTEM_SCALE_MIN = 0.8;
const SYSTEM_SCALE_MAX = 2;
/** Upper bound for app × system, so layouts stay usable at accessibility sizes. */
const COMBINED_MAX = 2.2;

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

export function readFollowSystemText(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(FOLLOW_SYSTEM_KEY) !== "false";
}

/** WebKit exposes the iOS/iPadOS Dynamic Type size through `font: -apple-system-body`. */
export function systemTextSupported(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("font", "-apple-system-body");
}

let probe: HTMLSpanElement | null = null;

function probeElement(): HTMLSpanElement | null {
  if (typeof document === "undefined" || !document.body || !systemTextSupported()) return null;
  if (probe?.isConnected) return probe;
  probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.textContent = "M";
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0;white-space:nowrap;font:-apple-system-body;";
  document.body.appendChild(probe);
  return probe;
}

/** Ratio of the current Dynamic Type body size to the default (1 = "Large"). */
export function readSystemTextScale(): number {
  const el = probeElement();
  if (!el) return 1;
  const px = Number.parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(px) || px <= 0) return 1;
  const ratio = px / APPLE_BODY_DEFAULT_PX;
  return Math.min(SYSTEM_SCALE_MAX, Math.max(SYSTEM_SCALE_MIN, Number(ratio.toFixed(3))));
}

export function applyFontScale(scale: number): void {
  if (typeof document === "undefined") return;
  const app = clampFontScale(scale);
  const system = readFollowSystemText() ? readSystemTextScale() : 1;
  const combined = Math.min(COMBINED_MAX, Number((app * system).toFixed(3)));
  const root = document.documentElement.style;
  root.setProperty("--app-font-scale", String(combined));
  root.setProperty("--system-text-scale", String(system));
}

export function persistFontScale(scale: number): void {
  const next = clampFontScale(scale);
  window.localStorage.setItem(FONT_SCALE_KEY, String(next));
  applyFontScale(next);
}

export function persistFollowSystemText(follow: boolean): void {
  window.localStorage.setItem(FOLLOW_SYSTEM_KEY, String(follow));
  applyFontScale(readFontScale());
}

export function fontScalePercent(scale: number): string {
  return `${Math.round(clampFontScale(scale) * 100)} %`;
}

/**
 * Follow the iOS text size (Settings or the Control Center "Text Size" control) live.
 * WebKit re-lays out `-apple-system-body` text when it changes, which the ResizeObserver
 * picks up; focus/visibility cover the case where the app was in the background.
 */
export function watchSystemTextSize(onChange?: (systemScale: number) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const el = probeElement();
  if (!el) return () => undefined;
  let last = readSystemTextScale();
  const update = () => {
    const next = readSystemTextScale();
    if (next === last) return;
    last = next;
    applyFontScale(readFontScale());
    onChange?.(next);
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
  ro?.observe(el);
  const onVisible = () => {
    if (document.visibilityState === "visible") update();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", update);
  window.addEventListener("pageshow", update);
  return () => {
    ro?.disconnect();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", update);
    window.removeEventListener("pageshow", update);
  };
}

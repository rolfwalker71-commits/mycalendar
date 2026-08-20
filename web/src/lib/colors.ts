import type { CSSProperties } from "react";

export function parseHex(color: string | null | undefined): [number, number, number] | null {
  if (!color) return null;
  let hex = color.trim();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) return null;
  const n = Number.parseInt(hex, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Google-Kalenderfarbe → gedämpftes Pastell, Ton bleibt erkennbar. */
export function toPastel(color: string, dark = isDark()): string {
  const rgb = parseHex(color);
  if (!rgb) return dark ? "#3d4550" : "#d7e4ef";
  const [h, s] = rgbToHsl(...rgb);
  if (dark) {
    return toHex(hslToRgb(h, Math.min(0.36, s * 0.48), 0.34));
  }
  return toHex(hslToRgb(h, Math.min(0.46, s * 0.52), 0.86));
}

function toPastelAccent(color: string, dark = isDark()): string {
  const rgb = parseHex(color);
  if (!rgb) return dark ? "#8aa4bb" : "#8eb4cc";
  const [h, s] = rgbToHsl(...rgb);
  if (dark) {
    return toHex(hslToRgb(h, Math.min(0.42, s * 0.6), 0.52));
  }
  return toHex(hslToRgb(h, Math.min(0.5, s * 0.62), 0.62));
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastText(bg: string | null | undefined): string {
  if (!bg) return "#1a1a1a";
  return relativeLuminance(bg) > 0.45 ? "#1a1a1a" : "#f5f5f7";
}

export function calendarColor(bg: string | null | undefined): string {
  return toPastel(bg || "#5ac8fa");
}

export function eventChipStyle(bg: string | null | undefined): CSSProperties {
  const source = bg || "#5ac8fa";
  const dark = isDark();
  const background = toPastel(source, dark);
  return {
    backgroundColor: background,
    color: contrastText(background),
    borderLeft: `3px solid ${toPastelAccent(source, dark)}`,
    borderRadius: 3,
  };
}

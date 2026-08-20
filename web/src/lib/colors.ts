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
  return relativeLuminance(bg) > 0.45 ? "#1a1a1a" : "#ffffff";
}

export function calendarColor(bg: string | null | undefined): string {
  return bg || "#5ac8fa";
}

export function eventChipStyle(bg: string | null | undefined): CSSProperties {
  const background = calendarColor(bg);
  return {
    backgroundColor: background,
    color: contrastText(background),
  };
}

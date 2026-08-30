import { DateTime } from "luxon";
import { ZONE } from "@/lib/dates";

export function calendarDayNumber(at = DateTime.now().setZone(ZONE)): number {
  return at.day;
}

/** SVG of proposal A with today's day number. Transparent pad. */
export function appMarkSvg(day: number, dark: boolean): string {
  const n = String(Math.min(31, Math.max(1, Math.round(day))));
  const page = dark ? "#2c2c2e" : "#ffffff";
  const numeral = dark ? "#f5f5f7" : "#1c1c1e";
  const mail = dark ? "#e8e8ed" : "#ffffff";
  const hole = dark ? "#1c1c1e" : "#3a3a3c";
  const shadow = dark ? "rgba(0,0,0,0.45)" : "rgba(28,28,30,0.18)";
  const size = n.length === 1 ? 46 : 38;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="${shadow}"/>
    </filter>
  </defs>
  <g filter="url(#drop)">
    <rect x="18" y="16" width="78" height="86" rx="16" fill="${page}"/>
    <path d="M18 32a16 16 0 0 1 16-16h46a16 16 0 0 1 16 16v12H18V32z" fill="#FF3B30"/>
    <circle cx="44" cy="28" r="4.2" fill="${hole}"/>
    <circle cx="70" cy="28" r="4.2" fill="${hole}"/>
    <text x="57" y="78" text-anchor="middle" font-family="ui-rounded, ui-sans-serif, system-ui, sans-serif" font-size="${size}" font-weight="800" fill="${numeral}">${n}</text>
    <rect x="70" y="78" width="40" height="34" rx="8" fill="${mail}"/>
    <path d="M76 86h28l-14 11z" fill="#FF3B30"/>
  </g>
</svg>`;
}

export function applyDocumentIcon(day: number, dark: boolean): void {
  if (typeof document === "undefined") return;
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(appMarkSvg(day, dark))}`;
  for (const rel of ["icon", "shortcut icon"]) {
    document.querySelectorAll(`link[rel="${rel}"]`).forEach((node) => node.remove());
  }
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = href;
  document.head.appendChild(link);
}

export function msUntilNextZoneMidnight(): number {
  const n = DateTime.now().setZone(ZONE);
  const next = n.plus({ days: 1 }).startOf("day");
  return Math.max(1000, next.diff(n).as("milliseconds") + 250);
}

import { DateTime } from "luxon";
import { ZONE } from "@/lib/dates";

export function calendarDayNumber(at = DateTime.now().setZone(ZONE)): number {
  return at.day;
}

/** Same mark as the app icon, with today's number on the peeking card. */
export function appMarkSvg(day: number, dark: boolean): string {
  const n = String(Math.min(31, Math.max(1, Math.round(day))));
  const paper = dark ? "#F5F5F7" : "#FFFFFF";
  const card = dark ? "#E9E9EE" : "#F2F2F7";
  const ink = "#1C1C1E";
  const red = "#E0241B";
  const redLight = "#FF453A";
  const redDeep = "#A8140E";
  const numeral = n.length > 1 ? 118 : 138;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${redLight}"/>
      <stop offset="1" stop-color="${red}"/>
    </linearGradient>
    <filter id="soft" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="rgba(0,0,0,0.22)"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="230" fill="url(#bg)"/>
  <rect x="182" y="150" width="660" height="724" rx="104" fill="${paper}"/>
  <path d="M182 254a104 104 0 0 1 104-104h452a104 104 0 0 1 104 104v92H182z" fill="${ink}"/>
  <circle cx="336" cy="250" r="30" fill="${paper}"/>
  <circle cx="688" cy="250" r="30" fill="${paper}"/>
  <g filter="url(#soft)">
    <rect x="286" y="470" width="452" height="300" rx="48" fill="${redDeep}"/>
    <rect x="352" y="388" width="320" height="250" rx="34" fill="${card}"/>
    <text x="512" y="566" text-anchor="middle" fill="${ink}" font-family="ui-rounded, -apple-system, system-ui, sans-serif" font-size="${numeral}" font-weight="800">${n}</text>
    <path d="M286 518v198c0 27 21 48 48 48h356c27 0 48-21 48-48V518L512 668z" fill="${red}"/>
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

import { DateTime } from "luxon";
import { ZONE } from "@/lib/dates";
import type { MailAddress } from "./types";

export function displayName(addr: MailAddress, fallback = "Unbekannt"): string {
  return addr.name || addr.email || fallback;
}

export function initials(addr: MailAddress): string {
  const src = displayName(addr);
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 1).toUpperCase() || "?";
}

export function formatMailDate(raw: string, internalDate?: string | null): string {
  let dt = raw ? DateTime.fromRFC2822(raw) : DateTime.invalid("empty");
  if (!dt.isValid && internalDate) {
    const ms = Number(internalDate);
    if (Number.isFinite(ms)) dt = DateTime.fromMillis(ms);
  }
  if (!dt.isValid) return "";
  const local = dt.setZone(ZONE).setLocale("de");
  const today = DateTime.now().setZone(ZONE);
  if (local.hasSame(today, "day")) return local.toFormat("HH:mm");
  if (local.hasSame(today, "year")) return local.toFormat("d. LLL");
  return local.toFormat("dd.LL.yyyy");
}

export function formatMailDateLong(raw: string, internalDate?: string | null): string {
  let dt = raw ? DateTime.fromRFC2822(raw) : DateTime.invalid("empty");
  if (!dt.isValid && internalDate) {
    const ms = Number(internalDate);
    if (Number.isFinite(ms)) dt = DateTime.fromMillis(ms);
  }
  if (!dt.isValid) return "";
  return dt.setZone(ZONE).setLocale("de").toFormat("cccc, d. LLLL yyyy, HH:mm");
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^re:/i.test(trimmed)) return trimmed;
  return trimmed ? `Re: ${trimmed}` : "Re:";
}

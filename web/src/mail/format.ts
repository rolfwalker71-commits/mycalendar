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

export function forwardSubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^(fwd|wg|fw):/i.test(trimmed)) return trimmed;
  return trimmed ? `Fwd: ${trimmed}` : "Fwd:";
}

export function emailsFromHeader(raw: string): string[] {
  const matches = raw.match(/[^\s<,;]+@[^\s>,;]+/g) ?? [];
  return [...new Set(matches.map((e) => e.replace(/[<>]/g, "").toLowerCase()))];
}

export function replyAllRecipients(
  message: { from: { email: string }; to: string; cc: string },
  selfEmail: string,
): { to: string[]; cc: string[] } {
  const self = selfEmail.trim().toLowerCase();
  const to = new Set<string>();
  if (message.from.email && message.from.email.toLowerCase() !== self) {
    to.add(message.from.email.toLowerCase());
  }
  for (const e of emailsFromHeader(message.to)) {
    if (e !== self) to.add(e);
  }
  const cc = new Set<string>();
  for (const e of emailsFromHeader(message.cc)) {
    if (e !== self && !to.has(e)) cc.add(e);
  }
  return { to: [...to], cc: [...cc] };
}

export function quotedForwardHtml(message: {
  from: { name: string; email: string };
  to: string;
  date: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const body = message.html || `<pre>${escapeHtml(message.text || "")}</pre>`;
  return `<br><br><blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">
<p>-------- Weitergeleitete Nachricht --------<br>
Von: ${escapeHtml(message.from.name || message.from.email)} &lt;${escapeHtml(message.from.email)}&gt;<br>
Datum: ${escapeHtml(message.date)}<br>
Betreff: ${escapeHtml(message.subject)}<br>
An: ${escapeHtml(message.to)}</p>
${body}
</blockquote>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

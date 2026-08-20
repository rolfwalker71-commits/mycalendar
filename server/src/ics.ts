import { DateTime } from "luxon";
import { TZ } from "./config.js";
import type { EventAttachmentJson, EventRow } from "./types.js";

function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length ? 74 : 75), bytes.length);
    while (end > start && (bytes[end - 1] & 0xc0) === 0x80) end -= 1;
    const chunk = bytes.subarray(start, end).toString("utf8");
    parts.push(parts.length ? ` ${chunk}` : chunk);
    start = end;
  }
  return parts.join("\r\n");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtc(dt: Date): string {
  return DateTime.fromJSDate(dt).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function formatDate(isoDate: string): string {
  return isoDate.replace(/-/g, "").slice(0, 8);
}

export function eventToVevent(
  event: EventRow & { calendar_summary?: string | null },
): string {
  const uid = event.ical_uid || `${event.google_event_id}@kalender`;
  const lines = ["BEGIN:VEVENT", `UID:${uid}`];
  if (event.all_day && event.all_day_start && event.all_day_end) {
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.all_day_start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(event.all_day_end)}`);
  } else if (event.start_at && event.end_at) {
    lines.push(`DTSTART:${formatUtc(event.start_at)}`);
    lines.push(`DTEND:${formatUtc(event.end_at)}`);
  }
  lines.push(`DTSTAMP:${formatUtc(event.updated_at ?? new Date())}`);
  if (event.summary) lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.status) lines.push(`STATUS:${event.status.toUpperCase()}`);
  if (event.html_link) lines.push(`URL:${event.html_link}`);
  for (const a of event.attendees ?? []) {
    const params = [`CN=${escapeText(a.displayName || a.email)}`];
    if (a.resource) params.push("CUTYPE=RESOURCE");
    if (a.responseStatus === "accepted") params.push("PARTSTAT=ACCEPTED");
    else if (a.responseStatus === "declined") params.push("PARTSTAT=DECLINED");
    else if (a.responseStatus === "tentative") params.push("PARTSTAT=TENTATIVE");
    else params.push("PARTSTAT=NEEDS-ACTION");
    lines.push(`ATTENDEE;${params.join(";")}:mailto:${a.email}`);
  }
  const attachments = (event.attachments ?? []) as EventAttachmentJson[];
  for (const att of attachments) {
    if (att.fileUrl) lines.push(`ATTACH:${att.fileUrl}`);
  }
  if (event.recurrence?.length) {
    for (const rule of event.recurrence) {
      if (rule.startsWith("RRULE:")) lines.push(rule);
      else if (rule.startsWith("EXDATE") || rule.startsWith("RDATE")) lines.push(rule);
    }
  }
  lines.push("END:VEVENT");
  return lines.map(fold).join("\r\n");
}

export function buildVcalendar(
  events: Array<EventRow & { calendar_summary?: string | null }>,
  calName?: string,
): string {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kalender & Mail//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (calName) body.push(`X-WR-CALNAME:${escapeText(calName)}`);
  body.push(`X-WR-TIMEZONE:${TZ}`);
  for (const event of events) body.push(eventToVevent(event));
  body.push("END:VCALENDAR");
  return `${body.join("\r\n")}\r\n`;
}

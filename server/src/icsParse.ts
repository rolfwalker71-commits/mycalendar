import { DateTime } from "luxon";
import { TZ } from "./config.js";

export type ParsedVEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone?: string;
  recurrence?: string[];
  attendees?: { email: string; displayName?: string }[];
};

export type ParsedIcs = {
  method?: string;
  calendarName?: string;
  events: ParsedVEvent[];
};

function unfold(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

function unescape(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } {
  const colon = line.indexOf(":");
  const left = colon >= 0 ? line.slice(0, colon) : line;
  const value = colon >= 0 ? line.slice(colon + 1) : "";
  const [name, ...rest] = left.split(";");
  const params: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: (name ?? "").toUpperCase(), params, value };
}

function parseDate(
  value: string,
  params: Record<string, string>,
): { iso: string; allDay: boolean; zone: string } {
  const zone = params.TZID?.replace(/^"|"$/g, "") || TZ;
  const compact = value.replace(/[-:]/g, "");
  if (params.VALUE === "DATE" || /^\d{8}$/.test(compact)) {
    const day = DateTime.fromFormat(compact.slice(0, 8), "yyyyMMdd", { zone });
    return { iso: day.toISODate() ?? compact.slice(0, 8), allDay: true, zone };
  }
  if (compact.endsWith("Z")) {
    const dt = DateTime.fromFormat(compact, "yyyyMMdd'T'HHmmss'Z'", { zone: "utc" });
    return { iso: dt.toISO() ?? value, allDay: false, zone: "utc" };
  }
  const dt = DateTime.fromFormat(compact.slice(0, 15), "yyyyMMdd'T'HHmmss", { zone });
  return { iso: (dt.isValid ? dt : DateTime.fromISO(value, { zone })).toISO() ?? value, allDay: false, zone };
}

function mailto(value: string): { email: string; displayName?: string } | null {
  const email = value.replace(/^mailto:/i, "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  return { email };
}

export function parseIcs(raw: string): ParsedIcs {
  const lines = unfold(raw);
  const events: ParsedVEvent[] = [];
  let method: string | undefined;
  let calendarName: string | undefined;
  let current: Record<string, { params: Record<string, string>; value: string }[]> | null = null;
  let recurrence: string[] = [];

  const pushCurrent = () => {
    if (!current) return;
    const startRaw = current.DTSTART?.[0];
    if (!startRaw) {
      current = null;
      recurrence = [];
      return;
    }
    const start = parseDate(startRaw.value, startRaw.params);
    const endRaw = current.DTEND?.[0];
    const duration = current.DURATION?.[0]?.value;
    let end: { iso: string; allDay: boolean; zone: string };
    if (endRaw) {
      end = parseDate(endRaw.value, endRaw.params);
    } else if (start.allDay) {
      const next = DateTime.fromISO(start.iso).plus({ days: 1 });
      end = { iso: next.toISODate() ?? start.iso, allDay: true, zone: start.zone };
    } else {
      const base = DateTime.fromISO(start.iso);
      const plus = duration?.startsWith("PT") && /PT(\d+)H/.test(duration)
        ? Number(/PT(\d+)H/.exec(duration)?.[1] ?? 1)
        : 1;
      end = { iso: base.plus({ hours: plus }).toISO() ?? start.iso, allDay: false, zone: start.zone };
    }
    const attendees: { email: string; displayName?: string }[] = [];
    for (const row of current.ATTENDEE ?? []) {
      const parsed = mailto(row.value);
      if (!parsed) continue;
      if (row.params.CN) parsed.displayName = unescape(row.params.CN);
      attendees.push(parsed);
    }
    events.push({
      uid: current.UID?.[0]?.value || `ics-${events.length}`,
      summary: unescape(current.SUMMARY?.[0]?.value || "Termin"),
      description: current.DESCRIPTION?.[0] ? unescape(current.DESCRIPTION[0].value) : undefined,
      location: current.LOCATION?.[0] ? unescape(current.LOCATION[0].value) : undefined,
      start: start.iso,
      end: end.iso,
      allDay: start.allDay,
      timezone: start.allDay ? undefined : start.zone,
      recurrence: recurrence.length ? recurrence : undefined,
      attendees: attendees.length ? attendees : undefined,
    });
    current = null;
    recurrence = [];
  };

  for (const line of lines) {
    const { name, params, value } = parseLine(line);
    if (name === "METHOD") method = value.toUpperCase();
    if (name === "X-WR-CALNAME") calendarName = unescape(value);
    if (name === "BEGIN" && value === "VEVENT") {
      current = {};
      recurrence = [];
      continue;
    }
    if (name === "END" && value === "VEVENT") {
      pushCurrent();
      continue;
    }
    if (!current) continue;
    if (name === "RRULE") recurrence.push(`RRULE:${value}`);
    else if (name === "EXDATE" || name === "RDATE") recurrence.push(`${name}${params.TZID ? `;TZID=${params.TZID}` : ""}:${value}`);
    else {
      (current[name] ??= []).push({ params, value });
    }
  }

  return { method, calendarName, events };
}

const WEEKDAYS: Record<string, number> = {
  montag: 1, mo: 1,
  dienstag: 2, di: 2,
  mittwoch: 3, mi: 3,
  donnerstag: 4, do: 4,
  freitag: 5, fr: 5,
  samstag: 6, sa: 6,
  sonntag: 7, so: 7,
};

export function extractEventFromText(subject: string, body: string): ParsedVEvent | null {
  const text = `${subject}\n${body}`.replace(/<[^>]+>/g, " ");
  const now = DateTime.now().setZone(TZ);
  let day = now;
  let found = false;

  const dateMatch = text.match(/\b(\d{1,2})\.(\d{1,2})\.(?:(\d{2,4}))?\b/);
  if (dateMatch) {
    const year = dateMatch[3]
      ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3])
      : now.year;
    day = DateTime.fromObject(
      { year, month: Number(dateMatch[2]), day: Number(dateMatch[1]) },
      { zone: TZ },
    );
    found = day.isValid;
  } else {
    const wd = text.toLowerCase().match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/);
    if (wd) {
      const target = WEEKDAYS[wd[1] ?? ""];
      if (target != null) {
        let next = now.set({ weekday: target as 1 | 2 | 3 | 4 | 5 | 6 | 7 });
        if (next < now.startOf("day")) next = next.plus({ weeks: 1 });
        day = next;
        found = true;
      }
    }
  }

  const timeMatch =
    text.match(/\b(\d{1,2})[:.](\d{2})\s*uhr\b/i) ||
    text.match(/\b(\d{1,2})\s*uhr\b/i);
  let hour = 10;
  let minute = 0;
  let timed = false;
  if (timeMatch) {
    hour = Math.min(23, Number(timeMatch[1]));
    minute = timeMatch[2] ? Math.min(59, Number(timeMatch[2])) : 0;
    timed = true;
    found = true;
  }

  if (!found) return null;
  const start = timed
    ? day.set({ hour, minute, second: 0, millisecond: 0 })
    : day.startOf("day");
  const end = timed ? start.plus({ hours: 1 }) : start.plus({ days: 1 });
  return {
    uid: `hint-${start.toISO()}`,
    summary: subject.replace(/^(aw|re|fwd|wg):\s*/i, "").trim() || "Termin",
    start: timed ? start.toISO() ?? "" : start.toISODate() ?? "",
    end: timed ? end.toISO() ?? "" : end.toISODate() ?? "",
    allDay: !timed,
    timezone: timed ? TZ : undefined,
  };
}

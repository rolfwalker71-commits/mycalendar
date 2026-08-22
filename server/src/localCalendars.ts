import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { TZ } from "./config.js";
import { parseIcs, type ParsedVEvent } from "./icsParse.js";
import type { CalendarRow, EventRow, UserRow } from "./types.js";

export function isLocalCalId(googleCalId: string): boolean {
  return googleCalId.startsWith("ics:") || googleCalId.startsWith("birthday:");
}

export async function ensureLocalCalendar(
  userId: string,
  googleCalId: string,
  summary: string,
  background: string,
): Promise<CalendarRow> {
  await query(
    `INSERT INTO calendars (
       user_id, google_cal_id, summary, color, background_color, foreground_color,
       timezone, selected, primary_cal, access_role, source, updated_at
     ) VALUES ($1,$2,$3,null,$4,'#ffffff',$5,TRUE,FALSE,'owner',$6, NOW())
     ON CONFLICT (user_id, google_cal_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       background_color = EXCLUDED.background_color,
       source = EXCLUDED.source,
       updated_at = NOW()`,
    [userId, googleCalId, summary, background, TZ, googleCalId.startsWith("ics:") ? "ics" : "birthday"],
  );
  const { rows } = await query<CalendarRow>(
    "SELECT * FROM calendars WHERE user_id = $1 AND google_cal_id = $2",
    [userId, googleCalId],
  );
  return rows[0]!;
}

function occurrenceKey(uid: string, start: string): string {
  return `${uid}:${start}`.slice(0, 1024);
}

function insertEvent(
  userId: string,
  calendarId: string,
  ev: ParsedVEvent,
  start: string,
  end: string,
): Promise<unknown> {
  const allDay = ev.allDay;
  return query(
    `INSERT INTO events (
       user_id, calendar_id, google_event_id, ical_uid, summary, description, location,
       status, start_at, end_at, all_day, all_day_start, all_day_end, timezone,
       attendees, recurrence, event_type, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,'default', NOW())
     ON CONFLICT (calendar_id, google_event_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       description = EXCLUDED.description,
       location = EXCLUDED.location,
       start_at = EXCLUDED.start_at,
       end_at = EXCLUDED.end_at,
       all_day = EXCLUDED.all_day,
       all_day_start = EXCLUDED.all_day_start,
       all_day_end = EXCLUDED.all_day_end,
       timezone = EXCLUDED.timezone,
       attendees = EXCLUDED.attendees,
       updated_at = NOW()`,
    [
      userId,
      calendarId,
      occurrenceKey(ev.uid, start),
      ev.uid,
      ev.summary,
      ev.description ?? null,
      ev.location ?? null,
      allDay ? null : start,
      allDay ? null : end,
      allDay,
      allDay ? start.slice(0, 10) : null,
      allDay ? end.slice(0, 10) : null,
      ev.timezone ?? TZ,
      ev.attendees?.length ? JSON.stringify(ev.attendees) : null,
      ev.recurrence?.length ? JSON.stringify(ev.recurrence) : null,
    ],
  );
}

function expandSimple(ev: ParsedVEvent, from: DateTime, to: DateTime): { start: string; end: string }[] {
  const rule = ev.recurrence?.find((r) => r.startsWith("RRULE:")) ?? "";
  const freq = /FREQ=([A-Z]+)/.exec(rule)?.[1];
  if (!freq) return [{ start: ev.start, end: ev.end }];

  const start0 = ev.allDay
    ? DateTime.fromISO(ev.start, { zone: TZ })
    : DateTime.fromISO(ev.start, { setZone: true });
  const end0 = ev.allDay
    ? DateTime.fromISO(ev.end, { zone: TZ })
    : DateTime.fromISO(ev.end, { setZone: true });
  if (!start0.isValid || !end0.isValid) return [{ start: ev.start, end: ev.end }];
  const dur = end0.diff(start0);
  const untilRaw = /UNTIL=([0-9T]+Z?)/.exec(rule)?.[1];
  const until = untilRaw
    ? DateTime.fromISO(untilRaw.replace(/(\d{8})T(\d{6})Z/, "$1T$2Z"))
    : to;
  const count = Number(/COUNT=(\d+)/.exec(rule)?.[1] ?? 0);
  const interval = Number(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? 1);
  const step =
    freq === "DAILY" ? { days: interval } :
    freq === "WEEKLY" ? { weeks: interval } :
    freq === "MONTHLY" ? { months: interval } :
    freq === "YEARLY" ? { years: interval } :
    null;
  if (!step) return [{ start: ev.start, end: ev.end }];

  const out: { start: string; end: string }[] = [];
  let cur = start0;
  let n = 0;
  while (cur <= to && cur <= until && (!count || n < count) && out.length < 400) {
    const end = cur.plus(dur);
    if (end > from) {
      out.push({
        start: ev.allDay ? cur.toISODate() ?? ev.start : cur.toISO() ?? ev.start,
        end: ev.allDay ? end.toISODate() ?? ev.end : end.toISO() ?? ev.end,
      });
    }
    cur = cur.plus(step);
    n += 1;
  }
  return out.length ? out : [{ start: ev.start, end: ev.end }];
}

export async function replaceCalendarEvents(
  userId: string,
  calendarId: string,
  events: ParsedVEvent[],
): Promise<number> {
  const from = DateTime.now().setZone(TZ).minus({ months: 1 });
  const to = DateTime.now().setZone(TZ).plus({ months: 14 });
  await query("DELETE FROM events WHERE calendar_id = $1", [calendarId]);
  let n = 0;
  for (const ev of events) {
    for (const occ of expandSimple(ev, from, to)) {
      await insertEvent(userId, calendarId, ev, occ.start, occ.end);
      n += 1;
    }
  }
  return n;
}

export async function syncIcsFeed(user: UserRow, feedId: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const { rows } = await query<{
    id: string;
    url: string;
    calendar_id: string;
    etag: string | null;
  }>("SELECT id, url, calendar_id, etag FROM ics_feeds WHERE id = $1 AND user_id = $2", [
    feedId,
    user.id,
  ]);
  const feed = rows[0];
  if (!feed) return { ok: false, count: 0, error: "Feed nicht gefunden." };
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Kalender-Mail/1.0",
        ...(feed.etag ? { "If-None-Match": feed.etag } : {}),
      },
      redirect: "follow",
    });
    if (res.status === 304) {
      await query("UPDATE ics_feeds SET last_sync_at = NOW(), last_error = NULL WHERE id = $1", [feed.id]);
      return { ok: true, count: 0 };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parseIcs(text);
    const count = await replaceCalendarEvents(user.id, feed.calendar_id, parsed.events);
    await query(
      "UPDATE ics_feeds SET last_sync_at = NOW(), last_error = NULL, etag = $2 WHERE id = $1",
      [feed.id, res.headers.get("etag")],
    );
    return { ok: true, count };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feed konnte nicht geladen werden.";
    await query("UPDATE ics_feeds SET last_error = $2 WHERE id = $1", [feed.id, message]);
    return { ok: false, count: 0, error: message };
  }
}

export async function subscribeIcsFeed(
  user: UserRow,
  url: string,
  name?: string,
): Promise<{ calendar: CalendarRow; feedId: string; count: number }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Ungültige Adresse.");
  }
  if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("Nur http(s)-Adressen.");
  const id = randomUUID();
  const googleCalId = `ics:${id}`;
  const title = name?.trim() || parsedUrl.hostname;
  const calendar = await ensureLocalCalendar(user.id, googleCalId, title, "#0b8043");
  await query(
    `INSERT INTO ics_feeds (id, user_id, calendar_id, url) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, url) DO UPDATE SET calendar_id = EXCLUDED.calendar_id`,
    [id, user.id, calendar.id, parsedUrl.toString()],
  );
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM ics_feeds WHERE user_id = $1 AND url = $2",
    [user.id, parsedUrl.toString()],
  );
  const feedId = rows[0]?.id ?? id;
  const synced = await syncIcsFeed(user, feedId);
  if (synced.error) throw new Error(synced.error);
  return { calendar, feedId, count: synced.count };
}

export async function removeIcsFeed(userId: string, feedId: string): Promise<boolean> {
  const { rows } = await query<{ calendar_id: string }>(
    "DELETE FROM ics_feeds WHERE id = $1 AND user_id = $2 RETURNING calendar_id",
    [feedId, userId],
  );
  if (!rows[0]) return false;
  await query("DELETE FROM calendars WHERE id = $1 AND user_id = $2", [rows[0].calendar_id, userId]);
  return true;
}

export async function listIcsFeeds(userId: string) {
  const { rows } = await query<{
    id: string;
    url: string;
    last_sync_at: Date | null;
    last_error: string | null;
    calendar_id: string;
    summary: string | null;
  }>(
    `SELECT f.id, f.url, f.last_sync_at, f.last_error, f.calendar_id, c.summary
       FROM ics_feeds f
       JOIN calendars c ON c.id = f.calendar_id
      WHERE f.user_id = $1
      ORDER BY c.summary ASC`,
    [userId],
  );
  return rows;
}

export async function syncAllIcsFeeds(user: UserRow): Promise<void> {
  const { rows } = await query<{ id: string }>("SELECT id FROM ics_feeds WHERE user_id = $1", [user.id]);
  for (const row of rows) {
    await syncIcsFeed(user, row.id);
  }
}

export type ContactPerson = {
  resourceName: string;
  name: string;
  emails: string[];
  phones: { value: string; type?: string }[];
  photoUrl: string | null;
  birthday: { month: number; day: number; year?: number } | null;
  organization?: string | null;
};

export function birthdayEventsForRange(
  contacts: ContactPerson[],
  calendar: CalendarRow,
  from: DateTime,
  to: DateTime,
): Array<EventRow & { background_color: string | null; calendar_summary: string | null; calendar_timezone: string | null }> {
  const out: Array<EventRow & { background_color: string | null; calendar_summary: string | null; calendar_timezone: string | null }> = [];
  for (const c of contacts) {
    if (!c.birthday) continue;
    let year = from.year;
    while (year <= to.year) {
      const start = DateTime.fromObject(
        { year, month: c.birthday.month, day: c.birthday.day },
        { zone: TZ },
      );
      if (start.isValid && start >= from.startOf("day") && start < to) {
        const age = c.birthday.year ? year - c.birthday.year : null;
        const id = `bday-${c.resourceName.replace(/[^\w-]/g, "")}-${year}`;
        out.push({
          id,
          user_id: calendar.user_id,
          calendar_id: calendar.id,
          google_event_id: id,
          ical_uid: `birthday-${c.resourceName}-${year}@kalender`,
          summary: `Geburtstag ${c.name}`,
          description: age && age > 0 ? `${c.name} wird ${age}.` : c.name,
          location: null,
          status: "confirmed",
          html_link: null,
          hangout_link: null,
          start_at: null,
          end_at: null,
          all_day: true,
          all_day_start: start.toISODate(),
          all_day_end: start.plus({ days: 1 }).toISODate(),
          timezone: TZ,
          attendees: null,
          recurrence: null,
          recurring_event_id: null,
          transparency: "transparent",
          visibility: "private",
          conference_data: null,
          event_type: "birthday",
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 540 }] },
          attachments: null,
          updated_at: new Date(),
          background_color: calendar.background_color,
          calendar_summary: calendar.summary,
          calendar_timezone: calendar.timezone,
        });
      }
      year += 1;
    }
  }
  return out;
}

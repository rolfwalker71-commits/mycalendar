import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { calendar_v3 } from "googleapis";
import { TZ } from "./config.js";
import { query } from "./db.js";
import {
  getAuthedCalendar,
  isAuthError,
  isGoneError,
  GoogleAuthError,
} from "./google.js";
import type { AttendeeJson, CalendarRow, EventRow, UserRow } from "./types.js";

function asDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function mapGoogleEvent(
  item: calendar_v3.Schema$Event,
  userId: string,
  calendarId: string,
): Omit<EventRow, "id" | "updated_at"> | null {
  if (!item.id) return null;
  const allDay = Boolean(item.start?.date);
  let startAt: Date | null = null;
  let endAt: Date | null = null;
  let allDayStart: string | null = null;
  let allDayEnd: string | null = null;
  let timezone: string | null = item.start?.timeZone ?? item.end?.timeZone ?? null;

  if (allDay) {
    allDayStart = asDate(item.start?.date);
    allDayEnd = asDate(item.end?.date);
    if (allDayStart) {
      startAt = DateTime.fromISO(allDayStart, { zone: TZ }).startOf("day").toJSDate();
    }
    if (allDayEnd) {
      endAt = DateTime.fromISO(allDayEnd, { zone: TZ }).startOf("day").toJSDate();
    }
  } else {
    if (item.start?.dateTime) startAt = new Date(item.start.dateTime);
    if (item.end?.dateTime) endAt = new Date(item.end.dateTime);
  }

  const attendees: AttendeeJson[] | null = item.attendees
    ? item.attendees
        .filter((a): a is NonNullable<typeof a> & { email: string } => Boolean(a.email))
        .map((a) => ({
          email: a.email,
          displayName: a.displayName ?? undefined,
          responseStatus: a.responseStatus ?? undefined,
          organizer: a.organizer ?? undefined,
          self: a.self ?? undefined,
        }))
    : null;

  const hangout =
    item.hangoutLink ??
    item.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")
      ?.uri ??
    null;

  return {
    user_id: userId,
    calendar_id: calendarId,
    google_event_id: item.id,
    ical_uid: item.iCalUID ?? null,
    summary: item.summary ?? null,
    description: item.description ?? null,
    location: item.location ?? null,
    status: item.status ?? null,
    html_link: item.htmlLink ?? null,
    hangout_link: hangout,
    start_at: startAt,
    end_at: endAt,
    all_day: allDay,
    all_day_start: allDayStart,
    all_day_end: allDayEnd,
    timezone,
    attendees,
    recurrence: item.recurrence ?? null,
    recurring_event_id: item.recurringEventId ?? null,
    transparency: item.transparency ?? null,
    visibility: item.visibility ?? null,
    conference_data: item.conferenceData ?? null,
  };
}

async function upsertEvent(row: Omit<EventRow, "id" | "updated_at">): Promise<void> {
  await query(
    `INSERT INTO events (
       user_id, calendar_id, google_event_id, ical_uid, summary, description,
       location, status, html_link, hangout_link, start_at, end_at, all_day,
       all_day_start, all_day_end, timezone, attendees, recurrence,
       recurring_event_id, transparency, visibility, conference_data, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20,$21,$22::jsonb, NOW()
     )
     ON CONFLICT (calendar_id, google_event_id) DO UPDATE SET
       ical_uid = EXCLUDED.ical_uid,
       summary = EXCLUDED.summary,
       description = EXCLUDED.description,
       location = EXCLUDED.location,
       status = EXCLUDED.status,
       html_link = EXCLUDED.html_link,
       hangout_link = EXCLUDED.hangout_link,
       start_at = EXCLUDED.start_at,
       end_at = EXCLUDED.end_at,
       all_day = EXCLUDED.all_day,
       all_day_start = EXCLUDED.all_day_start,
       all_day_end = EXCLUDED.all_day_end,
       timezone = EXCLUDED.timezone,
       attendees = EXCLUDED.attendees,
       recurrence = EXCLUDED.recurrence,
       recurring_event_id = EXCLUDED.recurring_event_id,
       transparency = EXCLUDED.transparency,
       visibility = EXCLUDED.visibility,
       conference_data = EXCLUDED.conference_data,
       updated_at = NOW()`,
    [
      row.user_id,
      row.calendar_id,
      row.google_event_id,
      row.ical_uid,
      row.summary,
      row.description,
      row.location,
      row.status,
      row.html_link,
      row.hangout_link,
      row.start_at,
      row.end_at,
      row.all_day,
      row.all_day_start,
      row.all_day_end,
      row.timezone,
      row.attendees ? JSON.stringify(row.attendees) : null,
      row.recurrence ? JSON.stringify(row.recurrence) : null,
      row.recurring_event_id,
      row.transparency,
      row.visibility,
      row.conference_data ? JSON.stringify(row.conference_data) : null,
    ],
  );
}

async function deleteCachedEvent(
  calendarId: string,
  googleEventId: string,
): Promise<void> {
  await query(
    "DELETE FROM events WHERE calendar_id = $1 AND google_event_id = $2",
    [calendarId, googleEventId],
  );
}

export async function syncCalendarList(user: UserRow): Promise<CalendarRow[]> {
  const cal = await getAuthedCalendar(user);
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await cal.calendarList.list({
      maxResults: 250,
      pageToken,
    });
    for (const item of res.data.items ?? []) {
      if (!item.id) continue;
      seen.add(item.id);
      await query(
        `INSERT INTO calendars (
           user_id, google_cal_id, summary, color, background_color,
           foreground_color, timezone, primary_cal, access_role, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
         ON CONFLICT (user_id, google_cal_id) DO UPDATE SET
           summary = EXCLUDED.summary,
           color = EXCLUDED.color,
           background_color = EXCLUDED.background_color,
           foreground_color = EXCLUDED.foreground_color,
           timezone = EXCLUDED.timezone,
           primary_cal = EXCLUDED.primary_cal,
           access_role = EXCLUDED.access_role,
           updated_at = NOW()`,
        [
          user.id,
          item.id,
          item.summary ?? "Kalender",
          item.colorId ?? null,
          item.backgroundColor ?? null,
          item.foregroundColor ?? null,
          item.timeZone ?? null,
          Boolean(item.primary),
          item.accessRole ?? null,
        ],
      );
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (seen.size > 0) {
    await query(
      `DELETE FROM calendars
        WHERE user_id = $1
          AND google_cal_id <> ALL($2::text[])`,
      [user.id, [...seen]],
    );
  }

  const { rows } = await query<CalendarRow>(
    `SELECT * FROM calendars WHERE user_id = $1
     ORDER BY primary_cal DESC, summary ASC`,
    [user.id],
  );
  return rows;
}

async function applyEventPage(
  userId: string,
  calendar: CalendarRow,
  items: calendar_v3.Schema$Event[] | undefined,
): Promise<void> {
  for (const item of items ?? []) {
    if (!item.id) continue;
    if (item.status === "cancelled") {
      await deleteCachedEvent(calendar.id, item.id);
      continue;
    }
    const mapped = mapGoogleEvent(item, userId, calendar.id);
    if (mapped) await upsertEvent(mapped);
  }
}

async function rangeSync(
  user: UserRow,
  calendar: CalendarRow,
  api: calendar_v3.Calendar,
  timeMin: string,
  timeMax: string,
  saveSyncToken: boolean,
): Promise<void> {
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const res = await api.events.list({
      calendarId: calendar.google_cal_id,
      timeMin,
      timeMax,
      singleEvents: true,
      maxResults: 2500,
      pageToken,
    });
    await applyEventPage(user.id, calendar, res.data.items);
    pageToken = res.data.nextPageToken ?? undefined;
    if (res.data.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
  } while (pageToken);

  if (saveSyncToken && nextSyncToken) {
    await query("UPDATE calendars SET sync_token = $1, updated_at = NOW() WHERE id = $2", [
      nextSyncToken,
      calendar.id,
    ]);
  }
}

async function incrementalSync(
  user: UserRow,
  calendar: CalendarRow,
  api: calendar_v3.Calendar,
): Promise<void> {
  if (!calendar.sync_token) return;
  let pageToken: string | undefined;
  let syncToken: string | undefined = calendar.sync_token;
  do {
    const res = await api.events.list({
      calendarId: calendar.google_cal_id,
      syncToken,
      pageToken,
      maxResults: 2500,
    });
    await applyEventPage(user.id, calendar, res.data.items);
    pageToken = res.data.nextPageToken ?? undefined;
    syncToken = undefined;
    if (res.data.nextSyncToken) {
      await query(
        "UPDATE calendars SET sync_token = $1, updated_at = NOW() WHERE id = $2",
        [res.data.nextSyncToken, calendar.id],
      );
    }
  } while (pageToken);
}

export async function syncUserEvents(
  user: UserRow,
  timeMin?: string,
  timeMax?: string,
): Promise<{ calendars: number; error?: string }> {
  const now = DateTime.now().setZone(TZ);
  const from =
    timeMin ??
    now.minus({ months: 1 }).startOf("day").toUTC().toISO();
  const to =
    timeMax ??
    now.plus({ months: 2 }).endOf("day").toUTC().toISO();
  if (!from || !to) {
    throw new Error("Ungültiger Zeitraum");
  }

  try {
    const calendars = await syncCalendarList(user);
    const api = await getAuthedCalendar(user);

    for (const calendar of calendars) {
      try {
        if (calendar.sync_token) {
          try {
            await incrementalSync(user, calendar, api);
          } catch (err) {
            if (isGoneError(err)) {
              await query(
                "UPDATE calendars SET sync_token = NULL WHERE id = $1",
                [calendar.id],
              );
              await query("DELETE FROM events WHERE calendar_id = $1", [calendar.id]);
              await rangeSync(user, { ...calendar, sync_token: null }, api, from, to, true);
              continue;
            }
            throw err;
          }
          await rangeSync(user, calendar, api, from, to, false);
        } else {
          await rangeSync(user, calendar, api, from, to, true);
        }
      } catch (err) {
        if (isAuthError(err)) {
          throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
        }
        console.error(`Sync-Fehler Kalender ${calendar.summary}:`, err);
      }
    }

    await query("UPDATE users SET last_sync_at = NOW() WHERE id = $1", [user.id]);
    return { calendars: calendars.length };
  } catch (err) {
    if (err instanceof GoogleAuthError) throw err;
    if (isAuthError(err)) {
      throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
    }
    throw err;
  }
}

export function eventToGoogleBody(input: {
  summary: string;
  description?: string | null;
  location?: string | null;
  allDay: boolean;
  start: string;
  end: string;
  timezone?: string;
  attendees?: { email: string }[];
  recurrence?: string[] | null;
  visibility?: string | null;
  createMeet?: boolean;
}): calendar_v3.Schema$Event {
  const tz = input.timezone || TZ;
  const body: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    visibility: input.visibility ?? undefined,
  };
  if (input.allDay) {
    body.start = { date: input.start.slice(0, 10) };
    body.end = { date: input.end.slice(0, 10) };
  } else {
    body.start = { dateTime: input.start, timeZone: tz };
    body.end = { dateTime: input.end, timeZone: tz };
  }
  if (input.attendees?.length) {
    body.attendees = input.attendees.map((a) => ({ email: a.email }));
  }
  if (input.recurrence?.length) {
    body.recurrence = input.recurrence;
  }
  if (input.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return body;
}

export async function refreshCachedEvent(
  user: UserRow,
  calendar: CalendarRow,
  googleEventId: string,
): Promise<void> {
  const api = await getAuthedCalendar(user);
  try {
    const res = await api.events.get({
      calendarId: calendar.google_cal_id,
      eventId: googleEventId,
    });
    if (res.data.status === "cancelled") {
      await deleteCachedEvent(calendar.id, googleEventId);
      return;
    }
    const mapped = mapGoogleEvent(res.data, user.id, calendar.id);
    if (mapped) await upsertEvent(mapped);
  } catch (err) {
    if (isAuthError(err)) {
      throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
    }
    const code = (err as { code?: number }).code;
    if (code === 404) {
      await deleteCachedEvent(calendar.id, googleEventId);
      return;
    }
    throw err;
  }
}

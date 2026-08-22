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
import { hiddenKeySet, isHiddenGoogleEvent } from "./hiddenEvents.js";
import { notifyNewCalendarEvent } from "./notify.js";
import { invalidateShiftArtCache, driveFileId } from "./shiftCover.js";
import { syncAllIcsFeeds } from "./localCalendars.js";
import type { AttendeeJson, CalendarRow, EventAttachmentJson, EventRow, ReminderJson, UserRow } from "./types.js";

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
          resource: a.resource ?? undefined,
        }))
    : null;

  const hangout =
    item.hangoutLink ??
    item.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")
      ?.uri ??
    null;

  const reminders: ReminderJson | null = item.reminders
    ? {
        useDefault: Boolean(item.reminders.useDefault),
        overrides: (item.reminders.overrides ?? [])
          .filter((o): o is { method: string; minutes: number } =>
            Boolean(o.method && o.minutes != null),
          )
          .map((o) => ({ method: o.method, minutes: o.minutes })),
      }
    : null;

  const attachments: EventAttachmentJson[] | null = item.attachments?.length
    ? item.attachments
        .filter((a): a is NonNullable<typeof a> => Boolean(a.fileUrl || a.fileId))
        .map((a) => {
          const fileUrl =
            a.fileUrl ||
            (a.fileId ? `https://drive.google.com/file/d/${a.fileId}/view` : "");
          return {
            fileUrl,
            title: a.title ?? undefined,
            mimeType: a.mimeType ?? undefined,
            iconLink: a.iconLink ?? undefined,
            fileId: a.fileId ?? driveFileId({ fileId: a.fileId, fileUrl }) ?? undefined,
          };
        })
        .filter((a) => a.fileUrl)
    : null;

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
    event_type: item.eventType ?? "default",
    reminders,
    attachments,
  };
}

async function upsertEvent(
  row: Omit<EventRow, "id" | "updated_at">,
): Promise<{ inserted: boolean; id: string } | null> {
  const { rows } = await query<{ id: string; inserted: boolean }>(
    `INSERT INTO events (
       user_id, calendar_id, google_event_id, ical_uid, summary, description,
       location, status, html_link, hangout_link, start_at, end_at, all_day,
       all_day_start, all_day_end, timezone, attendees, recurrence,
       recurring_event_id, transparency, visibility, conference_data,
       event_type, reminders, attachments, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20,$21,$22::jsonb,$23,$24::jsonb,$25::jsonb, NOW()
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
       event_type = EXCLUDED.event_type,
       reminders = EXCLUDED.reminders,
       attachments = EXCLUDED.attachments,
       updated_at = NOW()
     RETURNING id, (xmax = 0) AS inserted`,
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
      row.event_type,
      row.reminders ? JSON.stringify(row.reminders) : null,
      row.attachments ? JSON.stringify(row.attachments) : null,
    ],
  );
  const rowOut = rows[0];
  return rowOut ? { inserted: rowOut.inserted, id: rowOut.id } : null;
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
           foreground_color, timezone, primary_cal, access_role, default_reminders, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, NOW())
         ON CONFLICT (user_id, google_cal_id) DO UPDATE SET
           summary = EXCLUDED.summary,
           color = EXCLUDED.color,
           background_color = EXCLUDED.background_color,
           foreground_color = EXCLUDED.foreground_color,
           timezone = EXCLUDED.timezone,
           primary_cal = EXCLUDED.primary_cal,
           access_role = EXCLUDED.access_role,
           default_reminders = EXCLUDED.default_reminders,
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
          item.defaultReminders?.length
            ? JSON.stringify(
                item.defaultReminders
                  .filter((r) => r.method && r.minutes != null)
                  .map((r) => ({ method: r.method, minutes: r.minutes })),
              )
            : null,
        ],
      );
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (seen.size > 0) {
    await query(
      `DELETE FROM calendars
        WHERE user_id = $1
          AND google_cal_id <> ALL($2::text[])
          AND google_cal_id NOT LIKE 'ics:%'
          AND google_cal_id NOT LIKE 'birthday:%'`,
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
  user: UserRow,
  calendar: CalendarRow,
  items: calendar_v3.Schema$Event[] | undefined,
  hidden: Set<string>,
): Promise<void> {
  for (const item of items ?? []) {
    if (!item.id) continue;
    if (item.status === "cancelled" || isHiddenGoogleEvent(hidden, item)) {
      await deleteCachedEvent(calendar.id, item.id);
      continue;
    }
    const mapped = mapGoogleEvent(item, user.id, calendar.id);
    if (!mapped) continue;
    const saved = await upsertEvent(mapped);
    if (saved?.inserted && user.last_sync_at) {
      await notifyNewCalendarEvent(user, {
        id: saved.id,
        summary: mapped.summary,
        location: mapped.location,
        description: mapped.description,
        attendees: mapped.attendees,
        start_at: mapped.start_at,
        end_at: mapped.end_at,
        all_day: mapped.all_day,
        hangout_link: mapped.hangout_link,
        calendar_summary: calendar.summary,
      });
    }
  }
}

async function pruneMissingEvents(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  seenIds: string[],
): Promise<void> {
  const from = DateTime.fromISO(timeMin, { setZone: true });
  const to = DateTime.fromISO(timeMax, { setZone: true });
  if (!from.isValid || !to.isValid) return;
  const fromIso = from.toUTC().toISO();
  const toIso = to.toUTC().toISO();
  const fromDate = from.toISODate();
  const toDate = to.toISODate();
  if (!fromIso || !toIso || !fromDate || !toDate) return;
  if (seenIds.length) {
    await query(
      `DELETE FROM events
        WHERE calendar_id = $1
          AND google_event_id <> ALL($2::text[])
          AND (
            (all_day = FALSE AND start_at < $4::timestamptz AND COALESCE(end_at, start_at) > $3::timestamptz)
            OR
            (all_day = TRUE AND all_day_start < $6::date AND COALESCE(all_day_end, all_day_start) > $5::date)
          )`,
      [calendarId, seenIds, fromIso, toIso, fromDate, toDate],
    );
    return;
  }
  await query(
    `DELETE FROM events
      WHERE calendar_id = $1
        AND (
          (all_day = FALSE AND start_at < $3::timestamptz AND COALESCE(end_at, start_at) > $2::timestamptz)
          OR
          (all_day = TRUE AND all_day_start < $5::date AND COALESCE(all_day_end, all_day_start) > $4::date)
        )`,
    [calendarId, fromIso, toIso, fromDate, toDate],
  );
}

async function rangeSync(
  user: UserRow,
  calendar: CalendarRow,
  api: calendar_v3.Calendar,
  timeMin: string,
  timeMax: string,
  saveSyncToken: boolean,
  hidden: Set<string>,
): Promise<void> {
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const seen = new Set<string>();
  do {
    const res = await api.events.list({
      calendarId: calendar.google_cal_id,
      timeMin,
      timeMax,
      singleEvents: true,
      maxResults: 2500,
      pageToken,
      supportsAttachments: true,
    } as calendar_v3.Params$Resource$Events$List);
    for (const item of res.data.items ?? []) {
      if (item.id && item.status !== "cancelled" && !isHiddenGoogleEvent(hidden, item)) {
        seen.add(item.id);
      }
    }
    await applyEventPage(user, calendar, res.data.items, hidden);
    pageToken = res.data.nextPageToken ?? undefined;
    if (res.data.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
  } while (pageToken);

  await pruneMissingEvents(calendar.id, timeMin, timeMax, [...seen]);

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
  hidden: Set<string>,
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
      supportsAttachments: true,
    } as calendar_v3.Params$Resource$Events$List);
    await applyEventPage(user, calendar, res.data.items, hidden);
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
  full = false,
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

  invalidateShiftArtCache();

  try {
    const calendars = await syncCalendarList(user);
    if (full) {
      await query("UPDATE calendars SET sync_token = NULL WHERE user_id = $1", [user.id]);
    }
    const api = await getAuthedCalendar(user);
    const list = full ? calendars.map((c) => ({ ...c, sync_token: null })) : calendars;
    const hidden = await hiddenKeySet(user.id);

    for (const calendar of list) {
      if (
        calendar.google_cal_id.startsWith("ics:") ||
        calendar.google_cal_id.startsWith("birthday:")
      ) {
        continue;
      }
      try {
        if (calendar.sync_token) {
          try {
            await incrementalSync(user, calendar, api, hidden);
          } catch (err) {
            if (isGoneError(err)) {
              await query(
                "UPDATE calendars SET sync_token = NULL WHERE id = $1",
                [calendar.id],
              );
              await query("DELETE FROM events WHERE calendar_id = $1", [calendar.id]);
              await rangeSync(user, { ...calendar, sync_token: null }, api, from, to, true, hidden);
              continue;
            }
            throw err;
          }
          await rangeSync(user, calendar, api, from, to, false, hidden);
        } else {
          await rangeSync(user, calendar, api, from, to, true, hidden);
        }
      } catch (err) {
        if (isAuthError(err)) {
          throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
        }
        console.error(`Sync-Fehler Kalender ${calendar.summary}:`, err);
      }
    }

    await syncAllIcsFeeds(user).catch((err) => console.warn("ICS-Feeds:", err));
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
  attendees?: { email: string; resource?: boolean; displayName?: string }[];
  recurrence?: string[] | null;
  visibility?: string | null;
  createMeet?: boolean;
  reminders?: ReminderJson | null;
  attachments?: EventAttachmentJson[] | null;
  eventType?: string | null;
  focusTimeProperties?: calendar_v3.Schema$Event["focusTimeProperties"];
  outOfOfficeProperties?: calendar_v3.Schema$Event["outOfOfficeProperties"];
  workingLocationProperties?: calendar_v3.Schema$Event["workingLocationProperties"];
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
    body.attendees = input.attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName,
      resource: a.resource,
    }));
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
  if (input.reminders) {
    body.reminders = {
      useDefault: input.reminders.useDefault,
      overrides: input.reminders.useDefault ? undefined : input.reminders.overrides,
    };
  }
  if (input.attachments?.length) {
    body.attachments = input.attachments.map((a) => ({
      fileUrl: a.fileUrl,
      title: a.title,
      mimeType: a.mimeType,
      fileId: a.fileId,
    }));
  }
  const eventType = input.eventType && input.eventType !== "default" ? input.eventType : undefined;
  if (eventType) {
    body.eventType = eventType;
    if (eventType === "focusTime") {
      body.focusTimeProperties = input.focusTimeProperties ?? {
        autoDeclineMode: "declineNone",
        chatStatus: "doNotDisturb",
      };
      body.transparency = "opaque";
    }
    if (eventType === "outOfOffice") {
      body.outOfOfficeProperties = input.outOfOfficeProperties ?? {
        autoDeclineMode: "declineOnlyNewConflictingInvitations",
      };
      body.transparency = "opaque";
    }
    if (eventType === "workingLocation") {
      body.workingLocationProperties = input.workingLocationProperties ?? {
        type: "homeOffice",
      };
    }
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
      supportsAttachments: true,
    } as calendar_v3.Params$Resource$Events$Get);
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

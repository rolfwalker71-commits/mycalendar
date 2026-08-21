import { Router } from "express";
import { DateTime } from "luxon";
import { TZ } from "../config.js";
import { requireAuth, clearSessionCookie } from "../auth.js";
import { query } from "../db.js";
import { GoogleAuthError, describeGoogleApiError, getAuthedCalendar, downloadDriveBytes, isAuthError } from "../google.js";
import {
  eventToGoogleBody,
  refreshCachedEvent,
  syncUserEvents,
} from "../sync.js";
import type { CalendarRow, EventRow } from "../types.js";
import { buildVcalendar } from "../ics.js";
import { coverUrlFor, loadCoverFile } from "../shiftCover.js";

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

function handleGoogleError(res: import("express").Response, err: unknown): boolean {
  const described = describeGoogleApiError(err, "calendar");
  if (described) {
    if (described.code === "reauth") clearSessionCookie(res);
    res.status(described.status).json({ error: described.error, code: described.code });
    return true;
  }
  if (err instanceof GoogleAuthError && err.code === "reauth") {
    clearSessionCookie(res);
    res.status(401).json({ error: "Bitte erneut anmelden.", code: "reauth" });
    return true;
  }
  if (isAuthError(err)) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Bitte erneut anmelden.", code: "reauth" });
    return true;
  }
  return false;
}

function serializeEvent(e: EventRow & { background_color?: string | null; calendar_summary?: string | null; calendar_timezone?: string | null }) {
  return {
    id: e.id,
    calendarId: e.calendar_id,
    googleEventId: e.google_event_id,
    icalUid: e.ical_uid,
    summary: e.summary,
    description: e.description,
    location: e.location,
    status: e.status,
    htmlLink: e.html_link,
    hangoutLink: e.hangout_link,
    startAt: e.start_at,
    endAt: e.end_at,
    allDay: e.all_day,
    allDayStart: e.all_day_start,
    allDayEnd: e.all_day_end,
    timezone: e.timezone,
    attendees: e.attendees,
    recurrence: e.recurrence,
    recurringEventId: e.recurring_event_id,
    transparency: e.transparency,
    visibility: e.visibility,
    conferenceData: e.conference_data,
    eventType: e.event_type ?? "default",
    reminders: e.reminders ?? null,
    attachments: e.attachments ?? null,
    backgroundColor: e.background_color ?? null,
    calendarSummary: e.calendar_summary ?? null,
    calendarTimezone: e.calendar_timezone ?? null,
    updatedAt: e.updated_at,
    coverUrl: coverUrlFor(e),
  };
}

async function getOwnedEvent(userId: string, id: string) {
  const { rows } = await query<
    EventRow & {
      google_cal_id: string;
      background_color: string | null;
      calendar_summary: string | null;
      calendar_timezone: string | null;
      access_role: string | null;
    }
  >(
    `SELECT e.*, c.google_cal_id, c.background_color, c.summary AS calendar_summary,
            c.timezone AS calendar_timezone, c.access_role, c.id AS calendar_uuid
       FROM events e
       JOIN calendars c ON c.id = e.calendar_id
      WHERE e.id = $1 AND e.user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

async function getOwnedCalendar(userId: string, calendarId: string) {
  const { rows } = await query<CalendarRow>(
    "SELECT * FROM calendars WHERE id = $1 AND user_id = $2",
    [calendarId, userId],
  );
  return rows[0] ?? null;
}

eventsRouter.get("/", async (req, res) => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!from || !to) {
    res.status(400).json({ error: "Parameter from und to sind erforderlich." });
    return;
  }
  const fromDt = DateTime.fromISO(from, { setZone: true });
  const toDt = DateTime.fromISO(to, { setZone: true });
  if (!fromDt.isValid || !toDt.isValid) {
    res.status(400).json({ error: "Ungültiger Zeitraum." });
    return;
  }

  const calendarIdsRaw = String(req.query.calendarIds ?? "");
  const calendarIds = calendarIdsRaw
    ? calendarIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const fromDate = fromDt.toISODate();
  const toDate = toDt.toISODate();
  const params: unknown[] = [req.user!.id, fromDt.toUTC().toISO(), toDt.toUTC().toISO(), toDate, fromDate];
  let extra = "";
  if (calendarIds.length) {
    params.push(calendarIds);
    extra = ` AND e.calendar_id = ANY($${params.length}::uuid[])`;
  } else {
    extra = " AND c.selected = TRUE";
  }

  const { rows } = await query<
    EventRow & {
      background_color: string | null;
      calendar_summary: string | null;
      calendar_timezone: string | null;
    }
  >(
    `SELECT e.*, c.background_color, c.summary AS calendar_summary, c.timezone AS calendar_timezone
       FROM events e
       JOIN calendars c ON c.id = e.calendar_id
      WHERE e.user_id = $1
        AND e.status IS DISTINCT FROM 'cancelled'
        AND (
          (e.all_day = FALSE AND e.start_at < $3::timestamptz AND e.end_at > $2::timestamptz)
          OR
          (e.all_day = TRUE AND e.all_day_start < $4::date AND e.all_day_end > $5::date)
        )
        ${extra}
      ORDER BY e.all_day DESC, e.start_at ASC NULLS LAST, e.all_day_start ASC NULLS LAST`,
    params,
  );
  res.json({ events: rows.map(serializeEvent) });
});

eventsRouter.post("/", async (req, res) => {
  const body = req.body as {
    summary?: string;
    calendarId?: string;
    allDay?: boolean;
    start?: string;
    end?: string;
    timezone?: string;
    location?: string;
    description?: string;
    attendees?: { email: string; resource?: boolean; displayName?: string }[];
    recurrence?: string[];
    createMeet?: boolean;
    visibility?: string;
    reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] };
    attachments?: { fileUrl: string; title?: string; mimeType?: string }[];
    eventType?: string;
    focusTimeProperties?: { autoDeclineMode?: string; chatStatus?: string; declineMessage?: string };
    outOfOfficeProperties?: { autoDeclineMode?: string; declineMessage?: string };
    workingLocationProperties?: {
      type?: string;
      homeOffice?: object;
      customLocation?: { label?: string };
      officeLocation?: { label?: string; buildingId?: string };
    };
  };
  if (!body.summary?.trim() || !body.calendarId || !body.start || !body.end) {
    res.status(400).json({ error: "Titel, Kalender, Start und Ende sind erforderlich." });
    return;
  }

  const calendar = await getOwnedCalendar(req.user!.id, body.calendarId);
  if (!calendar) {
    res.status(404).json({ error: "Kalender nicht gefunden." });
    return;
  }

  try {
    const api = await getAuthedCalendar(req.user!);
    const requestBody = eventToGoogleBody({
      summary: body.summary.trim(),
      description: body.description,
      location: body.location,
      allDay: Boolean(body.allDay),
      start: body.start,
      end: body.end,
      timezone: body.timezone || calendar.timezone || TZ,
      attendees: body.attendees,
      recurrence: body.recurrence,
      visibility: body.visibility,
      createMeet: body.createMeet,
      reminders: body.reminders,
      attachments: body.attachments,
      eventType: body.eventType,
      focusTimeProperties: body.focusTimeProperties,
      outOfOfficeProperties: body.outOfOfficeProperties,
      workingLocationProperties: body.workingLocationProperties,
    });
    const created = await api.events.insert({
      calendarId: calendar.google_cal_id,
      requestBody,
      conferenceDataVersion: body.createMeet ? 1 : undefined,
      supportsAttachments: body.attachments?.length ? true : undefined,
      sendUpdates: body.attendees?.length ? "all" : "none",
    });
    if (!created.data.id) {
      res.status(502).json({ error: "Google hat keinen Termin zurückgegeben." });
      return;
    }
    await refreshCachedEvent(req.user!, calendar, created.data.id);
    const { rows } = await query<
      EventRow & {
        background_color: string | null;
        calendar_summary: string | null;
        calendar_timezone: string | null;
      }
    >(
      `SELECT e.*, c.background_color, c.summary AS calendar_summary, c.timezone AS calendar_timezone
         FROM events e JOIN calendars c ON c.id = e.calendar_id
        WHERE e.calendar_id = $1 AND e.google_event_id = $2`,
      [calendar.id, created.data.id],
    );
    res.status(201).json({ event: rows[0] ? serializeEvent(rows[0]) : null });
  } catch (err) {
    if (handleGoogleError(res, err)) return;
    console.error(err);
    res.status(502).json({ error: "Termin konnte nicht erstellt werden." });
  }
});

function untilFromInstanceStart(start: string, allDay: boolean): string {
  if (allDay) {
    return DateTime.fromISO(start).minus({ days: 1 }).toFormat("yyyyMMdd");
  }
  return DateTime.fromISO(start, { setZone: true })
    .minus({ seconds: 1 })
    .toUTC()
    .toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function withUntil(rules: string[], until: string): string[] {
  return rules.map((rule) => {
    if (!rule.startsWith("RRULE:")) return rule;
    const parts = rule
      .slice("RRULE:".length)
      .split(";")
      .filter((p) => !p.startsWith("UNTIL=") && !p.startsWith("COUNT="));
    parts.push(`UNTIL=${until}`);
    return `RRULE:${parts.join(";")}`;
  });
}

eventsRouter.patch("/:id", async (req, res) => {
  const event = await getOwnedEvent(req.user!.id, req.params.id);
  if (!event) {
    res.status(404).json({ error: "Termin nicht gefunden." });
    return;
  }
  const body = req.body as {
    summary?: string;
    calendarId?: string;
    allDay?: boolean;
    start?: string;
    end?: string;
    timezone?: string;
    location?: string | null;
    description?: string | null;
    attendees?: { email: string; resource?: boolean; displayName?: string }[];
    recurrence?: string[] | null;
    visibility?: string | null;
    createMeet?: boolean;
    scope?: "this" | "thisAndFollowing" | "all";
    reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] } | null;
    attachments?: { fileUrl: string; title?: string; mimeType?: string }[] | null;
    eventType?: string;
    focusTimeProperties?: { autoDeclineMode?: string; chatStatus?: string; declineMessage?: string };
    outOfOfficeProperties?: { autoDeclineMode?: string; declineMessage?: string };
    workingLocationProperties?: {
      type?: string;
      homeOffice?: object;
      customLocation?: { label?: string };
      officeLocation?: { label?: string; buildingId?: string };
    };
  };

  const calendar = await getOwnedCalendar(req.user!.id, event.calendar_id);
  if (!calendar) {
    res.status(404).json({ error: "Kalender nicht gefunden." });
    return;
  }

  let activeCalendar = calendar;
  const destCalendarId = typeof body.calendarId === "string" ? body.calendarId : "";
  if (destCalendarId && destCalendarId !== event.calendar_id) {
    const dest = await getOwnedCalendar(req.user!.id, destCalendarId);
    if (!dest) {
      res.status(404).json({ error: "Zielkalender nicht gefunden." });
      return;
    }
    const canWrite = (role: string | null) => ["owner", "writer"].includes(role ?? "");
    if (!canWrite(dest.access_role)) {
      res.status(403).json({ error: "In diesen Kalender kannst du Termine nicht verschieben." });
      return;
    }
    if (!canWrite(calendar.access_role)) {
      res.status(403).json({ error: "Diesen Termin kannst du nicht in einen anderen Kalender schieben." });
      return;
    }
    try {
      const api = await getAuthedCalendar(req.user!);
      const moveId = event.recurring_event_id || event.google_event_id;
      await api.events.move({
        calendarId: calendar.google_cal_id,
        eventId: moveId,
        destination: dest.google_cal_id,
      });
      await query(
        `UPDATE events
            SET calendar_id = $1, updated_at = NOW()
          WHERE user_id = $2
            AND calendar_id = $3
            AND (google_event_id = $4 OR recurring_event_id = $4 OR id = $5)`,
        [dest.id, req.user!.id, calendar.id, moveId, event.id],
      );
      event.calendar_id = dest.id;
      activeCalendar = dest;
    } catch (err) {
      if (handleGoogleError(res, err)) return;
      console.error(err);
      res.status(502).json({ error: "Termin konnte nicht in den anderen Kalender verschoben werden." });
      return;
    }
  }

  const scope = body.scope ?? "this";
  const patchBody = eventToGoogleBody({
    summary: (body.summary ?? event.summary ?? "").trim() || "(Ohne Titel)",
    description: body.description !== undefined ? body.description : event.description,
    location: body.location !== undefined ? body.location : event.location,
    allDay: body.allDay ?? event.all_day,
    start: body.start ?? (event.all_day ? event.all_day_start ?? "" : event.start_at?.toISOString() ?? ""),
    end: body.end ?? (event.all_day ? event.all_day_end ?? "" : event.end_at?.toISOString() ?? ""),
    timezone: body.timezone || event.timezone || activeCalendar.timezone || TZ,
    attendees: body.attendees,
    recurrence: body.recurrence === undefined ? undefined : body.recurrence ?? undefined,
    visibility: body.visibility !== undefined ? body.visibility : event.visibility,
    createMeet: body.createMeet,
    reminders: body.reminders !== undefined ? body.reminders : event.reminders,
    attachments: body.attachments !== undefined ? body.attachments : event.attachments,
    eventType: body.eventType ?? event.event_type,
    focusTimeProperties: body.focusTimeProperties,
    outOfOfficeProperties: body.outOfOfficeProperties,
    workingLocationProperties: body.workingLocationProperties,
  });

  try {
    const api = await getAuthedCalendar(req.user!);
    let targetId = event.google_event_id;

    if (scope === "all" && event.recurring_event_id) {
      targetId = event.recurring_event_id;
      const master = await api.events.get({
        calendarId: activeCalendar.google_cal_id,
        eventId: targetId,
      });
      if (master.data.recurrence && body.recurrence === undefined) {
        patchBody.recurrence = master.data.recurrence;
      }
      if (event.all_day) {
        delete patchBody.start;
        delete patchBody.end;
      }
    }

    if (scope === "thisAndFollowing" && event.recurring_event_id) {
      const master = await api.events.get({
        calendarId: activeCalendar.google_cal_id,
        eventId: event.recurring_event_id,
      });
      const instanceStart = event.all_day
        ? event.all_day_start ?? ""
        : event.start_at?.toISOString() ?? "";
      const until = untilFromInstanceStart(instanceStart, event.all_day);
      const rules = withUntil(master.data.recurrence ?? ["RRULE:FREQ=DAILY"], until);
      await api.events.patch({
        calendarId: activeCalendar.google_cal_id,
        eventId: event.recurring_event_id,
        requestBody: { recurrence: rules },
      });
      const inserted = await api.events.insert({
        calendarId: activeCalendar.google_cal_id,
        requestBody: {
          ...patchBody,
          recurrence: body.recurrence ?? master.data.recurrence,
        },
        conferenceDataVersion: body.createMeet ? 1 : undefined,
        supportsAttachments: patchBody.attachments?.length ? true : undefined,
        sendUpdates: "all",
      });
      if (inserted.data.id) {
        await refreshCachedEvent(req.user!, activeCalendar, inserted.data.id);
      }
      await syncUserEvents(req.user!);
      const { rows } = await query<
        EventRow & {
          background_color: string | null;
          calendar_summary: string | null;
          calendar_timezone: string | null;
        }
      >(
        `SELECT e.*, c.background_color, c.summary AS calendar_summary, c.timezone AS calendar_timezone
           FROM events e JOIN calendars c ON c.id = e.calendar_id
          WHERE e.id = $1`,
        [event.id],
      );
      res.json({ event: rows[0] ? serializeEvent(rows[0]) : serializeEvent(event) });
      return;
    }

    await api.events.patch({
      calendarId: activeCalendar.google_cal_id,
      eventId: targetId,
      requestBody: patchBody,
      conferenceDataVersion: body.createMeet ? 1 : undefined,
      supportsAttachments: patchBody.attachments?.length ? true : undefined,
      sendUpdates: "all",
    });
    await refreshCachedEvent(req.user!, activeCalendar, targetId);
    if (targetId !== event.google_event_id) {
      await syncUserEvents(req.user!);
    }
    const { rows } = await query<
      EventRow & {
        background_color: string | null;
        calendar_summary: string | null;
        calendar_timezone: string | null;
      }
    >(
      `SELECT e.*, c.background_color, c.summary AS calendar_summary, c.timezone AS calendar_timezone
         FROM events e JOIN calendars c ON c.id = e.calendar_id
        WHERE e.user_id = $1 AND e.google_event_id = $2
        ORDER BY e.start_at ASC NULLS LAST
        LIMIT 1`,
      [req.user!.id, targetId === event.google_event_id ? event.google_event_id : targetId],
    );
    res.json({ event: rows[0] ? serializeEvent(rows[0]) : serializeEvent(event) });
  } catch (err) {
    if (handleGoogleError(res, err)) return;
    console.error(err);
    res.status(502).json({ error: "Termin konnte nicht gespeichert werden." });
  }
});

eventsRouter.delete("/:id", async (req, res) => {
  const event = await getOwnedEvent(req.user!.id, req.params.id);
  if (!event) {
    res.status(404).json({ error: "Termin nicht gefunden." });
    return;
  }
  const calendar = await getOwnedCalendar(req.user!.id, event.calendar_id);
  if (!calendar) {
    res.status(404).json({ error: "Kalender nicht gefunden." });
    return;
  }
  const scope = String(req.query.scope ?? req.body?.scope ?? "this") as
    | "this"
    | "thisAndFollowing"
    | "all";
  try {
    const api = await getAuthedCalendar(req.user!);
    let eventId = event.google_event_id;
    if (scope === "all" && event.recurring_event_id) {
      eventId = event.recurring_event_id;
    }
    await api.events.delete({
      calendarId: calendar.google_cal_id,
      eventId,
      sendUpdates: "all",
    });
    if (scope === "all" && event.recurring_event_id) {
      await query(
        "DELETE FROM events WHERE user_id = $1 AND (google_event_id = $2 OR recurring_event_id = $2)",
        [req.user!.id, event.recurring_event_id],
      );
    } else {
      await query("DELETE FROM events WHERE id = $1 AND user_id = $2", [
        event.id,
        req.user!.id,
      ]);
    }
    res.json({ ok: true });
  } catch (err) {
    if (handleGoogleError(res, err)) return;
    console.error(err);
    res.status(502).json({ error: "Termin konnte nicht gelöscht werden." });
  }
});

eventsRouter.post("/:id/rsvp", async (req, res) => {
  const status = String(req.body?.responseStatus ?? "");
  if (!["accepted", "tentative", "declined"].includes(status)) {
    res.status(400).json({ error: "Ungültige Zusage." });
    return;
  }
  const event = await getOwnedEvent(req.user!.id, req.params.id);
  if (!event) {
    res.status(404).json({ error: "Termin nicht gefunden." });
    return;
  }
  const calendar = await getOwnedCalendar(req.user!.id, event.calendar_id);
  if (!calendar) {
    res.status(404).json({ error: "Kalender nicht gefunden." });
    return;
  }
  try {
    const api = await getAuthedCalendar(req.user!);
    const current = await api.events.get({
      calendarId: calendar.google_cal_id,
      eventId: event.google_event_id,
    });
    const attendees = (current.data.attendees ?? []).map((a) =>
      a.self ? { ...a, responseStatus: status } : a,
    );
    await api.events.patch({
      calendarId: calendar.google_cal_id,
      eventId: event.google_event_id,
      requestBody: { attendees },
      sendUpdates: "all",
    });
    await refreshCachedEvent(req.user!, calendar, event.google_event_id);
    const { rows } = await query<
      EventRow & {
        background_color: string | null;
        calendar_summary: string | null;
        calendar_timezone: string | null;
      }
    >(
      `SELECT e.*, c.background_color, c.summary AS calendar_summary, c.timezone AS calendar_timezone
         FROM events e JOIN calendars c ON c.id = e.calendar_id
        WHERE e.id = $1`,
      [event.id],
    );
    res.json({ event: rows[0] ? serializeEvent(rows[0]) : null });
  } catch (err) {
    if (handleGoogleError(res, err)) return;
    console.error(err);
    res.status(502).json({ error: "Zusage konnte nicht gespeichert werden." });
  }
});

eventsRouter.get("/:id/cover", async (req, res) => {
  const event = await getOwnedEvent(req.user!.id, req.params.id);
  if (!event) {
    res.status(404).end();
    return;
  }
  try {
    const file = await loadCoverFile(
      {
        googleEventId: event.google_event_id,
        summary: event.summary,
        calendarSummary: event.calendar_summary,
        attachments: event.attachments,
      },
      async (fileId) => downloadDriveBytes(req.user!, fileId),
    );
    if (!file) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(file.buffer);
  } catch (err) {
    console.error(err);
    res.status(404).end();
  }
});

eventsRouter.get("/:id/ics", async (req, res) => {
  const event = await getOwnedEvent(req.user!.id, req.params.id);
  if (!event) {
    res.status(404).json({ error: "Termin nicht gefunden." });
    return;
  }
  const ics = buildVcalendar([event], event.calendar_summary ?? "Kalender");
  const filename = `${(event.summary || "termin").replace(/[^\w\-]+/g, "_").slice(0, 40)}.ics`;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(ics);
});

eventsRouter.get("/export.ics", async (req, res) => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!from || !to) {
    res.status(400).json({ error: "Parameter from und to sind erforderlich." });
    return;
  }
  const fromDt = DateTime.fromISO(from, { setZone: true });
  const toDt = DateTime.fromISO(to, { setZone: true });
  if (!fromDt.isValid || !toDt.isValid) {
    res.status(400).json({ error: "Ungültiger Zeitraum." });
    return;
  }
  const fromDate = fromDt.toISODate();
  const toDate = toDt.toISODate();
  const { rows } = await query<EventRow & { calendar_summary: string | null }>(
    `SELECT e.*, c.summary AS calendar_summary
       FROM events e
       JOIN calendars c ON c.id = e.calendar_id
      WHERE e.user_id = $1
        AND e.status IS DISTINCT FROM 'cancelled'
        AND c.selected = TRUE
        AND (
          (e.all_day = FALSE AND e.start_at < $3::timestamptz AND e.end_at > $2::timestamptz)
          OR
          (e.all_day = TRUE AND e.all_day_start < $4::date AND e.all_day_end > $5::date)
        )
      ORDER BY e.start_at ASC NULLS LAST`,
    [req.user!.id, fromDt.toUTC().toISO(), toDt.toUTC().toISO(), toDate, fromDate],
  );
  const ics = buildVcalendar(rows, "Kalender");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="kalender.ics"');
  res.send(ics);
});

eventsRouter.post("/freebusy", async (req, res) => {
  const emails = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((x: unknown) => typeof x === "string")
    : [];
  const timeMin = typeof req.body?.timeMin === "string" ? req.body.timeMin : "";
  const timeMax = typeof req.body?.timeMax === "string" ? req.body.timeMax : "";
  if (!timeMin || !timeMax) {
    res.status(400).json({ error: "Zeitraum fehlt." });
    return;
  }
  try {
    const api = await getAuthedCalendar(req.user!);
    const items = [{ id: "primary" }, ...emails.map((id: string) => ({ id }))];
    const unique = [...new Map(items.map((i) => [i.id, i])).values()];
    const { data } = await api.freebusy.query({
      requestBody: { timeMin, timeMax, items: unique },
    });
    const calendars = data.calendars ?? {};
    const result = Object.entries(calendars).map(([id, info]) => ({
      id,
      busy: (info.busy ?? []).map((b) => ({ start: b.start, end: b.end })),
      errors: info.errors ?? [],
    }));
    res.json({ calendars: result });
  } catch (err) {
    if (handleGoogleError(res, err)) return;
    console.error(err);
    res.status(502).json({ error: "Frei/Belegt konnte nicht geladen werden." });
  }
});

eventsRouter.post("/find-time", async (req, res) => {
  const emails = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((x: unknown) => typeof x === "string")
    : [];
  const durationMin = Number(req.body?.durationMin ?? 30) === 60 ? 60 : 30;
  const now = DateTime.now().setZone(TZ);
  const timeMin = now.toUTC().toISO() ?? "";
  const timeMax = now.plus({ days: 7 }).endOf("day").toUTC().toISO() ?? "";
  try {
    const api = await getAuthedCalendar(req.user!);
    const items = [{ id: "primary" }, ...emails.map((id: string) => ({ id }))];
    const unique = [...new Map(items.map((i) => [i.id, i])).values()];
    const { data } = await api.freebusy.query({
      requestBody: { timeMin, timeMax, items: unique },
    });
    const busy = Object.values(data.calendars ?? {}).flatMap((info) =>
      (info.busy ?? []).map((b) => ({
        start: DateTime.fromISO(b.start ?? "", { setZone: true }),
        end: DateTime.fromISO(b.end ?? "", { setZone: true }),
      })),
    );
    const slots: { start: string; end: string }[] = [];
    let cursor = now.plus({ minutes: 15 - (now.minute % 15 || 15) }).set({ second: 0, millisecond: 0 });
    const limit = now.plus({ days: 7 });
    while (cursor < limit && slots.length < 8) {
      const local = cursor.setZone(TZ);
      if (local.weekday > 5 || local.hour < 8 || local.hour >= 18) {
        if (local.hour >= 18 || local.weekday > 5) {
          cursor = local.plus({ days: local.weekday >= 5 ? 8 - local.weekday : 1 }).startOf("day").set({ hour: 8 });
        } else {
          cursor = local.set({ hour: 8, minute: 0 });
        }
        continue;
      }
      const start = cursor;
      const end = cursor.plus({ minutes: durationMin });
      if (end.hour > 18 || (end.hour === 18 && end.minute > 0)) {
        cursor = local.plus({ days: 1 }).startOf("day").set({ hour: 8 });
        continue;
      }
      const overlaps = busy.some((b) => b.start.isValid && b.end.isValid && b.start < end && b.end > start);
      if (!overlaps) {
        slots.push({
          start: start.toISO({ suppressMilliseconds: true }) ?? "",
          end: end.toISO({ suppressMilliseconds: true }) ?? "",
        });
      }
      cursor = cursor.plus({ minutes: 15 });
    }
    res.json({ slots, durationMin });
  } catch (err) {
    if (handleGoogleError(res, err)) return;
    console.error(err);
    res.status(502).json({ error: "Freie Zeiten konnten nicht ermittelt werden." });
  }
});

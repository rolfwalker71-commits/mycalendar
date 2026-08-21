import { Router } from "express";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";
import type { EventRow } from "../types.js";
import { coverUrlFor } from "../shiftCover.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, "\\$&")}%`;
}

searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) {
    res.json({ events: [] });
    return;
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
          e.summary ILIKE $2 ESCAPE '\\'
          OR e.location ILIKE $2 ESCAPE '\\'
          OR e.description ILIKE $2 ESCAPE '\\'
        )
      ORDER BY e.start_at ASC NULLS LAST
      LIMIT 60`,
    [req.user!.id, likePattern(q)],
  );
  res.json({
    events: rows.map((e) => ({
      id: e.id,
      calendarId: e.calendar_id,
      googleEventId: e.google_event_id,
      summary: e.summary,
      description: e.description,
      location: e.location,
      startAt: e.start_at,
      endAt: e.end_at,
      allDay: e.all_day,
      allDayStart: e.all_day_start,
      allDayEnd: e.all_day_end,
      timezone: e.timezone,
      hangoutLink: e.hangout_link,
      attendees: e.attendees,
      backgroundColor: e.background_color,
      calendarSummary: e.calendar_summary,
      calendarTimezone: e.calendar_timezone,
      recurringEventId: e.recurring_event_id,
      coverUrl: coverUrlFor(e),
    })),
  });
});

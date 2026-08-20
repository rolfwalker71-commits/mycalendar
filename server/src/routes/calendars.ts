import { Router } from "express";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";
import type { CalendarRow } from "../types.js";

export const calendarsRouter = Router();
calendarsRouter.use(requireAuth);

calendarsRouter.get("/", async (req, res) => {
  const { rows } = await query<CalendarRow>(
    `SELECT * FROM calendars WHERE user_id = $1
     ORDER BY primary_cal DESC, summary ASC`,
    [req.user!.id],
  );
  res.json({
    calendars: rows.map((c) => ({
      id: c.id,
      googleCalId: c.google_cal_id,
      summary: c.summary,
      color: c.color,
      backgroundColor: c.background_color,
      foregroundColor: c.foreground_color,
      timezone: c.timezone,
      selected: c.selected,
      primary: c.primary_cal,
      accessRole: c.access_role,
      defaultReminders: c.default_reminders ?? [],
    })),
  });
});

calendarsRouter.get("/rooms", async (req, res) => {
  const { rows } = await query<CalendarRow>(
    `SELECT * FROM calendars
      WHERE user_id = $1
        AND (
          google_cal_id ILIKE '%resource.calendar.google.com'
          OR google_cal_id ILIKE '%group.calendar.google.com'
        )
      ORDER BY summary ASC`,
    [req.user!.id],
  );
  const rooms = rows
    .filter((c) => c.google_cal_id.toLowerCase().includes("resource.calendar.google.com"))
    .map((c) => ({
      id: c.google_cal_id,
      summary: c.summary,
      backgroundColor: c.background_color,
    }));
  res.json({
    rooms,
    hint: rooms.length
      ? null
      : "Keine Ressourcenkalender sichtbar. Räume in Google Calendar abonnieren. Die Directory-API (Workspace-Admin) wird nicht verwendet.",
  });
});

calendarsRouter.patch("/:id", async (req, res) => {
  const selected = Boolean(req.body?.selected);
  const { rows } = await query<CalendarRow>(
    `UPDATE calendars SET selected = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [selected, req.params.id, req.user!.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Kalender nicht gefunden." });
    return;
  }
  res.json({
    id: rows[0].id,
    selected: rows[0].selected,
  });
});

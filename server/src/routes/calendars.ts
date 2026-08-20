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
    })),
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

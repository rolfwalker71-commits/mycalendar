import { Router } from "express";
import { requireAuth, clearSessionCookie, loadUserById } from "../auth.js";
import { query } from "../db.js";
import { GoogleAuthError, isAuthError } from "../google.js";
import { syncUserEvents } from "../sync.js";
import { TZ } from "../config.js";
import type { UserRow } from "../types.js";
import { geminiAvailable } from "../gemini.js";

function meJson(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    pictureUrl: u.picture_url,
    weekStart: u.week_start === 0 ? 0 : 1,
    lastSyncAt: u.last_sync_at,
    timezone: TZ,
    notifyCalendar: u.notify_calendar !== false,
    notifyMail: u.notify_mail !== false,
    geminiAvailable: geminiAvailable(),
  };
}

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/", (req, res) => {
  res.json(meJson(req.user!));
});

meRouter.patch("/", async (req, res) => {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (req.body?.weekStart === 0 || req.body?.weekStart === 1) {
    sets.push(`week_start = $${i++}`);
    vals.push(req.body.weekStart);
  }
  if (typeof req.body?.notifyCalendar === "boolean") {
    sets.push(`notify_calendar = $${i++}`);
    vals.push(req.body.notifyCalendar);
  }
  if (typeof req.body?.notifyMail === "boolean") {
    sets.push(`notify_mail = $${i++}`);
    vals.push(req.body.notifyMail);
  }
  if (!sets.length) {
    res.status(400).json({ error: "Keine gültigen Felder." });
    return;
  }
  vals.push(req.user!.id);
  await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${i}`, vals);
  const updated = await loadUserById(req.user!.id);
  res.json(meJson(updated ?? req.user!));
});

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.post("/", async (req, res) => {
  const timeMin = typeof req.body?.timeMin === "string" ? req.body.timeMin : undefined;
  const timeMax = typeof req.body?.timeMax === "string" ? req.body.timeMax : undefined;
  try {
    const result = await syncUserEvents(req.user!, timeMin, timeMax);
    const { rows } = await query<{ last_sync_at: Date | null }>(
      "SELECT last_sync_at FROM users WHERE id = $1",
      [req.user!.id],
    );
    res.json({
      ok: true,
      calendars: result.calendars,
      lastSyncAt: rows[0]?.last_sync_at ?? new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof GoogleAuthError && err.code === "reauth") {
      clearSessionCookie(res);
      res.status(401).json({ error: "Bitte erneut anmelden.", code: "reauth" });
      return;
    }
    if (isAuthError(err)) {
      clearSessionCookie(res);
      res.status(401).json({ error: "Bitte erneut anmelden.", code: "reauth" });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Synchronisation fehlgeschlagen." });
  }
});

export const googlePushRouter = Router();

googlePushRouter.post("/push", async (req, res) => {
  const state = String(req.header("X-Goog-Resource-State") ?? "");
  if (state === "sync") {
    res.status(200).end();
    return;
  }
  res.status(200).end();
});

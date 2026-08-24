import { Router } from "express";
import { requireAuth, clearSessionCookie, loadUserById } from "../auth.js";
import { query } from "../db.js";
import { GoogleAuthError, isAuthError } from "../google.js";
import { syncUserEvents } from "../sync.js";
import { TZ, msConfigured } from "../config.js";
import type { UserRow, WorkingHoursJson } from "../types.js";
import { geminiAvailable, loadGeminiKey } from "../gemini.js";
import { describeGoogleApiError, getAuthedCalendar } from "../google.js";
import { subscribeLive } from "../live.js";
import { calendarWatchAvailable, ensureCalendarWatches, handleGooglePush } from "../watch.js";

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
    hideDeclined: Boolean(u.hide_declined),
    secondTimezone: u.second_timezone,
    workingHours: u.working_hours,
    geminiAvailable: geminiAvailable(),
    msConfigured: msConfigured(),
    msConnected: Boolean(u.ms_refresh_token_enc),
    msEmail: u.ms_email,
  };
}

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  await loadGeminiKey();
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
  if (typeof req.body?.hideDeclined === "boolean") {
    sets.push(`hide_declined = $${i++}`);
    vals.push(req.body.hideDeclined);
  }
  if (typeof req.body?.secondTimezone === "string" || req.body?.secondTimezone === null) {
    sets.push(`second_timezone = $${i++}`);
    vals.push(req.body.secondTimezone || null);
  }
  if (req.body?.workingHours && typeof req.body.workingHours === "object") {
    const wh = req.body.workingHours as WorkingHoursJson;
    sets.push(`working_hours = $${i++}::jsonb`);
    vals.push(JSON.stringify({
      enabled: Boolean(wh.enabled),
      days: wh.days && typeof wh.days === "object" ? wh.days : {},
    }));
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

meRouter.get("/calendar-settings", async (req, res) => {
  try {
    const api = await getAuthedCalendar(req.user!);
    const { data } = await api.settings.list({ maxResults: 250 });
    const items = (data.items ?? []).map((s) => ({ id: s.id, value: s.value }));
    res.json({
      googleSettings: items,
      workingHours: req.user!.working_hours,
      googleWorkingHoursSupported: false,
      note:
        "Die Calendar API v3 hat keine Schnittstelle für Arbeitszeiten (nur Zeitzone, Wochenende, Standarddauer usw.). Arbeitszeiten werden in dieser App gespeichert und in Tag-/Wochenansicht angezeigt. Fokuszeit, Abwesenheit und Arbeitsort sind als Terminarten verfügbar.",
    });
  } catch (err) {
    const described = describeGoogleApiError(err, "calendar");
    if (described) {
      res.status(described.status).json({
        error: described.error,
        code: described.code,
        workingHours: req.user!.working_hours,
        googleWorkingHoursSupported: false,
        note:
          "Die Calendar API v3 hat keine Schnittstelle für Arbeitszeiten. Arbeitszeiten werden in dieser App gespeichert.",
      });
      return;
    }
    console.error(err);
    res.status(502).json({
      error: "Kalendereinstellungen konnten nicht geladen werden.",
      workingHours: req.user!.working_hours,
      googleWorkingHoursSupported: false,
    });
  }
});

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  send("hello", { watch: calendarWatchAvailable() });
  const off = subscribeLive(req.user!.id, (payload) => send("change", payload));
  const beat = setInterval(() => res.write(": ping\n\n"), 25000);
  void ensureCalendarWatches(req.user!).catch((err) => console.warn("Watch:", err));
  req.on("close", () => {
    clearInterval(beat);
    off();
  });
});

syncRouter.post("/", async (req, res) => {
  const timeMin = typeof req.body?.timeMin === "string" ? req.body.timeMin : undefined;
  const timeMax = typeof req.body?.timeMax === "string" ? req.body.timeMax : undefined;
  try {
    const result = await syncUserEvents(req.user!, timeMin, timeMax, Boolean(req.body?.full));
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

googlePushRouter.post("/push", (req, res) => {
  res.status(200).end();
  void handleGooglePush(req.headers as Record<string, string | string[] | undefined>);
});

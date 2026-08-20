import { Router } from "express";
import { requireAuth, clearSessionCookie } from "../auth.js";
import { query } from "../db.js";
import { GoogleAuthError, isAuthError } from "../google.js";
import { syncUserEvents } from "../sync.js";
import { TZ } from "../config.js";

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/", (req, res) => {
  const u = req.user!;
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    pictureUrl: u.picture_url,
    weekStart: u.week_start === 0 ? 0 : 1,
    lastSyncAt: u.last_sync_at,
    timezone: TZ,
  });
});

meRouter.patch("/", async (req, res) => {
  const weekStart = req.body?.weekStart;
  if (weekStart !== 0 && weekStart !== 1) {
    res.status(400).json({ error: "weekStart muss 0 oder 1 sein." });
    return;
  }
  await query("UPDATE users SET week_start = $1 WHERE id = $2", [
    weekStart,
    req.user!.id,
  ]);
  res.json({ weekStart });
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

import { DateTime } from "luxon";
import { query } from "./db.js";
import { publicOrigin } from "./config.js";
import { getAuthedCalendar, newWatchRequestId } from "./google.js";
import { notifyLive } from "./live.js";
import { isLocalCalId } from "./localCalendars.js";
import { syncUserEvents } from "./sync.js";
import { loadUserById } from "./auth.js";
import type { CalendarRow, UserRow } from "./types.js";

function watchAddress(): string | null {
  const origin = publicOrigin();
  if (!origin.startsWith("https://")) return null;
  return `${origin}/api/google/push`;
}

export function calendarWatchAvailable(): boolean {
  return Boolean(watchAddress());
}

async function stopWatch(user: UserRow, channelId: string, resourceId: string | null): Promise<void> {
  if (!resourceId) return;
  try {
    const api = await getAuthedCalendar(user);
    await api.channels.stop({ requestBody: { id: channelId, resourceId } });
  } catch {
    /* already gone */
  }
}

export async function ensureCalendarWatches(user: UserRow): Promise<number> {
  const address = watchAddress();
  if (!address) return 0;
  const { rows: calendars } = await query<CalendarRow>(
    `SELECT * FROM calendars
      WHERE user_id = $1 AND selected = TRUE
        AND google_cal_id NOT LIKE 'ics:%'
        AND google_cal_id NOT LIKE 'birthday:%'`,
    [user.id],
  );
  const { rows: existing } = await query<{
    channel_id: string;
    calendar_id: string | null;
    resource_id: string | null;
    expiration: Date | null;
  }>("SELECT channel_id, calendar_id, resource_id, expiration FROM google_watches WHERE user_id = $1 AND kind = 'calendar'", [
    user.id,
  ]);
  const byCal = new Map(existing.map((w) => [w.calendar_id, w]));
  const soon = Date.now() + 24 * 60 * 60 * 1000;
  let n = 0;
  const api = await getAuthedCalendar(user);

  for (const calendar of calendars) {
    if (isLocalCalId(calendar.google_cal_id)) continue;
    const have = byCal.get(calendar.id);
    if (have?.expiration && have.expiration.getTime() > soon) continue;
    if (have) {
      await stopWatch(user, have.channel_id, have.resource_id);
      await query("DELETE FROM google_watches WHERE channel_id = $1", [have.channel_id]);
    }
    const channelId = newWatchRequestId();
    try {
      const { data } = await api.events.watch({
        calendarId: calendar.google_cal_id,
        requestBody: {
          id: channelId,
          type: "web_hook",
          address,
          token: user.id,
        },
      });
      const expiration = data.expiration
        ? DateTime.fromMillis(Number(data.expiration)).toJSDate()
        : DateTime.now().plus({ days: 6 }).toJSDate();
      await query(
        `INSERT INTO google_watches (channel_id, user_id, calendar_id, resource_id, expiration, kind)
         VALUES ($1,$2,$3,$4,$5,'calendar')`,
        [channelId, user.id, calendar.id, data.resourceId ?? null, expiration],
      );
      n += 1;
    } catch (err) {
      console.warn("Kalender-Watch fehlgeschlagen:", calendar.summary, (err as Error).message);
    }
  }
  return n;
}

export async function handleGooglePush(headers: Record<string, string | string[] | undefined>): Promise<void> {
  const state = String(headers["x-goog-resource-state"] ?? "");
  if (state === "sync") return;
  const channelId = String(headers["x-goog-channel-id"] ?? "");
  const token = String(headers["x-goog-channel-token"] ?? "");
  if (!channelId) return;
  const { rows } = await query<{ user_id: string }>(
    "SELECT user_id FROM google_watches WHERE channel_id = $1",
    [channelId],
  );
  const userId = rows[0]?.user_id ?? token;
  if (!userId) return;
  const user = await loadUserById(userId);
  if (!user?.refresh_token_enc) return;
  const now = DateTime.now();
  try {
    await syncUserEvents(
      user,
      now.minus({ months: 1 }).startOf("day").toUTC().toISO() ?? undefined,
      now.plus({ months: 2 }).endOf("day").toUTC().toISO() ?? undefined,
    );
    notifyLive(user.id, "calendar");
  } catch (err) {
    console.error("Push-Sync:", err);
  }
}

export async function renewDueWatches(): Promise<void> {
  const { rows } = await query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM google_watches
      WHERE expiration IS NULL OR expiration < NOW() + INTERVAL '36 hours'`,
  );
  for (const row of rows) {
    const user = await loadUserById(row.user_id);
    if (!user?.refresh_token_enc) continue;
    try {
      await ensureCalendarWatches(user);
    } catch (err) {
      console.warn("Watch-Erneuerung:", err);
    }
  }
}

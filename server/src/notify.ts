import { DateTime } from "luxon";
import { TZ } from "./config.js";
import { query } from "./db.js";
import { getAuthedGmail, isInsufficientScope } from "./google.js";
import { gravatarUrl } from "./mailAvatar.js";
import { headerMap, parseAddress, parsePayload } from "./mailMime.js";
import { markSent, sendPushToUser } from "./push.js";
import type { AttendeeJson, UserRow } from "./types.js";

type EventHit = {
  id: string;
  summary: string | null;
  location: string | null;
  description?: string | null;
  attendees?: AttendeeJson[] | null;
  start_at: Date | null;
  end_at: Date | null;
  all_day: boolean;
  hangout_link: string | null;
  calendar_summary: string | null;
};

const EVENT_SELECT = `e.id, e.user_id, e.summary, e.location, e.description, e.attendees,
            e.start_at, e.end_at, e.all_day, e.hangout_link, c.summary AS calendar_summary`;

function formatWhen(ev: EventHit): string {
  if (!ev.start_at) return "";
  const start = DateTime.fromJSDate(ev.start_at).setZone(TZ).setLocale("de");
  const end = ev.end_at
    ? DateTime.fromJSDate(ev.end_at).setZone(TZ).setLocale("de")
    : null;
  if (ev.all_day) return `Ganztägig · ${start.toFormat("cccc, d. LLLL")}`;
  const range = end
    ? `${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`
    : start.toFormat("HH:mm");
  if (start.hasSame(DateTime.now().setZone(TZ), "day")) return `Heute ${range}`;
  return `${start.toFormat("ccc, d. LLL")} ${range}`;
}

function clip(text: string, max: number): string {
  const t = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function attendeeLine(ev: EventHit): string | null {
  const list = Array.isArray(ev.attendees) ? ev.attendees : [];
  const names = list
    .filter((a) => !a.self)
    .map((a) => a.displayName || a.email)
    .filter(Boolean);
  if (!names.length) return null;
  const shown = names.slice(0, 4);
  const extra = names.length > shown.length ? ` +${names.length - shown.length}` : "";
  return shown.join(", ") + extra;
}

function eventBody(ev: EventHit): string {
  const parts = [formatWhen(ev)];
  if (ev.location) parts.push(ev.location);
  if (ev.hangout_link) parts.push("Google Meet");
  const who = attendeeLine(ev);
  if (who) parts.push(who);
  if (ev.calendar_summary) parts.push(ev.calendar_summary);
  if (ev.description) {
    const desc = clip(ev.description, 140);
    if (desc) parts.push(desc);
  }
  return parts.filter(Boolean).join("\n");
}

async function sendEventPush(
  userId: string,
  kind: "event-soon" | "event-start" | "event-allday" | "event-new",
  ev: EventHit,
  title: string,
  prefix?: string,
): Promise<void> {
  const body = prefix ? `${prefix}\n${eventBody(ev)}` : eventBody(ev);
  await sendPushToUser(userId, {
    title,
    body,
    image: "/logo.png",
    tag: `${kind}-${ev.id}`,
    data: { url: "/?module=calendar", module: "calendar" },
  });
}

export async function notifyCalendarReminders(): Promise<void> {
  const now = DateTime.now().setZone(TZ);
  const soonFrom = now.plus({ minutes: 12 }).toJSDate();
  const soonTo = now.plus({ minutes: 18 }).toJSDate();
  const startFrom = now.minus({ minutes: 2 }).toJSDate();
  const startTo = now.plus({ minutes: 1 }).toJSDate();

  const { rows: soon } = await query<EventHit & { user_id: string }>(
    `SELECT ${EVENT_SELECT}
       FROM events e
       JOIN calendars c ON c.id = e.calendar_id
       JOIN users u ON u.id = e.user_id
      WHERE u.notify_calendar
        AND c.selected
        AND e.status IS DISTINCT FROM 'cancelled'
        AND e.all_day = FALSE
        AND e.start_at BETWEEN $1 AND $2`,
    [soonFrom, soonTo],
  );

  for (const ev of soon) {
    if (!(await markSent(ev.user_id, "event-soon", ev.id))) continue;
    await sendEventPush(ev.user_id, "event-soon", ev, ev.summary || "Termin", "In 15 Minuten");
  }

  const { rows: starting } = await query<EventHit & { user_id: string }>(
    `SELECT ${EVENT_SELECT}
       FROM events e
       JOIN calendars c ON c.id = e.calendar_id
       JOIN users u ON u.id = e.user_id
      WHERE u.notify_calendar
        AND c.selected
        AND e.status IS DISTINCT FROM 'cancelled'
        AND e.all_day = FALSE
        AND e.start_at BETWEEN $1 AND $2`,
    [startFrom, startTo],
  );

  for (const ev of starting) {
    if (!(await markSent(ev.user_id, "event-start", ev.id))) continue;
    await sendEventPush(ev.user_id, "event-start", ev, ev.summary || "Termin beginnt");
  }

  const morning = now.set({ hour: 7, minute: 30, second: 0, millisecond: 0 });
  if (now >= morning && now < morning.plus({ minutes: 6 })) {
    const day = now.toFormat("yyyy-MM-dd");
    const { rows: allDay } = await query<EventHit & { user_id: string }>(
      `SELECT ${EVENT_SELECT}
         FROM events e
         JOIN calendars c ON c.id = e.calendar_id
         JOIN users u ON u.id = e.user_id
        WHERE u.notify_calendar
          AND c.selected
          AND e.all_day
          AND e.all_day_start <= $1::date
          AND (e.all_day_end IS NULL OR e.all_day_end > $1::date)`,
      [day],
    );
    for (const ev of allDay) {
      if (!(await markSent(ev.user_id, "event-allday", `${day}:${ev.id}`))) continue;
      await sendEventPush(ev.user_id, "event-allday", ev, ev.summary || "Ganztägiger Termin");
    }
  }
}

export async function notifyNewCalendarEvent(user: UserRow, ev: EventHit): Promise<void> {
  if (!user.notify_calendar || !ev.start_at) return;
  const start = DateTime.fromJSDate(ev.start_at);
  if (start < DateTime.now().minus({ minutes: 5 })) return;
  if (start > DateTime.now().plus({ days: 7 })) return;
  if (!(await markSent(user.id, "event-new", ev.id))) return;
  await sendEventPush(
    user.id,
    "event-new",
    ev,
    `Neuer Termin: ${ev.summary || "Ohne Titel"}`,
  );
}

async function subscribedUsers(): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(
    `SELECT DISTINCT u.*
       FROM users u
       JOIN push_subscriptions s ON s.user_id = u.id
      WHERE u.refresh_token_enc IS NOT NULL`,
  );
  return rows;
}

function firstMailImage(html: string): string | null {
  const re = /<img\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = re.exec(html))) {
    const el = tag[0];
    const src = el.match(/\bsrc=["'](https?:\/\/[^"']+)["']/i)?.[1];
    if (!src) continue;
    const w = el.match(/\bwidth=["'](\d+)["']/i);
    const h = el.match(/\bheight=["'](\d+)["']/i);
    if (w && h && Number(w[1]) <= 3 && Number(h[1]) <= 3) continue;
    if (/pixel|tracking|beacon|open\.gif|spacer|1x1/i.test(src)) continue;
    return src;
  }
  return null;
}

export async function notifyNewMail(): Promise<void> {
  for (const user of await subscribedUsers()) {
    if (!user.notify_mail) continue;
    try {
      const gmail = await getAuthedGmail(user);
      const profile = await gmail.users.getProfile({ userId: "me" });
      const currentId = profile.data.historyId ?? null;
      if (!currentId) continue;

      if (!user.gmail_history_id) {
        await query("UPDATE users SET gmail_history_id = $1 WHERE id = $2", [
          currentId,
          user.id,
        ]);
        continue;
      }

      let added: string[] = [];
      try {
        const hist = await gmail.users.history.list({
          userId: "me",
          startHistoryId: user.gmail_history_id,
          historyTypes: ["messageAdded"],
        });
        for (const h of hist.data.history ?? []) {
          for (const m of h.messagesAdded ?? []) {
            if (m.message?.id) added.push(m.message.id);
          }
        }
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === 404) {
          await query("UPDATE users SET gmail_history_id = $1 WHERE id = $2", [
            currentId,
            user.id,
          ]);
          continue;
        }
        throw err;
      }

      added = [...new Set(added)].slice(0, 8);
      for (const id of added) {
        if (!(await markSent(user.id, "mail", id))) continue;
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        });
        const labels = data.labelIds ?? [];
        if (
          labels.includes("DRAFT") ||
          labels.includes("SENT") ||
          labels.includes("SPAM") ||
          labels.includes("TRASH")
        ) {
          continue;
        }
        const headers = headerMap(data.payload?.headers);
        const from = parseAddress(headers.from);
        const subject = headers.subject || "(kein Betreff)";
        const who = from.name || from.email || "Neue Nachricht";
        const parsed = parsePayload(data.payload);
        const snippet = clip(data.snippet || parsed.text || "", 180);
        const parts = [subject];
        if (snippet && snippet !== subject) parts.push(snippet);
        if (parsed.attachments.length) {
          const names = parsed.attachments
            .map((a) => a.filename)
            .filter(Boolean)
            .slice(0, 3);
          parts.push(
            names.length
              ? `Anhang: ${names.join(", ")}`
              : `${parsed.attachments.length} Anhang`,
          );
        }
        const image =
          firstMailImage(parsed.html) ||
          gravatarUrl(from.email, { size: 512, fallback: "identicon" }) ||
          "/logo.png";
        await sendPushToUser(user.id, {
          title: who,
          body: parts.join("\n"),
          image,
          tag: `mail-${id}`,
          data: { url: "/?module=mail", module: "mail" },
        });
      }

      await query("UPDATE users SET gmail_history_id = $1 WHERE id = $2", [
        currentId,
        user.id,
      ]);
    } catch (err) {
      if (isInsufficientScope(err)) continue;
      console.error(`Mail-Push ${user.email}:`, err);
    }
  }
}

export async function runNotificationJobs(): Promise<void> {
  await notifyCalendarReminders();
  await notifyNewMail();
  await query("DELETE FROM notification_sent WHERE sent_at < NOW() - INTERVAL '14 days'");
}

import { createHash, randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { TZ } from "./config.js";
import { encrypt } from "./crypto.js";
import { GoogleAuthError, getAuthedGmail, getAuthedTasks, isAuthError, isInsufficientScope } from "./google.js";
import { headerMap, parseAddress } from "./mailMime.js";
import { listEventsForUser } from "./routes/events.js";
import { eventArtKindFor, eventArtThumbSrc } from "./shared/eventArt.js";
import type {
  WidgetConfig,
  WidgetDay,
  WidgetEvent,
  WidgetKind,
  WidgetMailItem,
  WidgetPayload,
  WidgetTask,
} from "./shared/widgets.js";
import type { UserRow } from "./types.js";

export type WidgetRow = {
  id: string;
  user_id: string;
  name: string;
  kind: WidgetKind;
  config: WidgetConfig;
  token_hash: string;
  token_enc: string;
  created_at: Date;
  last_used_at: Date | null;
};

const TOKEN_PREFIX = "kmw_";
const LOOKAHEAD_DAYS = 7;
const MAX_EVENTS_PER_DAY = 12;
const MAIL_CACHE_MS = 60_000;

export function newWidgetToken(): { token: string; hash: string; enc: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashWidgetToken(token), enc: encrypt(token) };
}

export function hashWidgetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeWidgetToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length > TOKEN_PREFIX.length + 20;
}

type ListedEvent = Awaited<ReturnType<typeof listEventsForUser>>[number];

function isDeclinedBySelf(ev: ListedEvent): boolean {
  const list = Array.isArray(ev.attendees) ? ev.attendees : [];
  return list.some((a) => a.self && a.responseStatus === "declined");
}

function toDt(value: unknown): DateTime | null {
  if (!value) return null;
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value)
      : DateTime.fromISO(String(value), { setZone: true });
  return dt.isValid ? dt.setZone(TZ) : null;
}

function timeLabel(ev: ListedEvent, start: DateTime | null, end: DateTime | null): string {
  if (ev.allDay) return "Ganztägig";
  if (!start) return "";
  if (!end) return start.toFormat("HH:mm");
  if (!start.hasSame(end, "day")) return `${start.toFormat("HH:mm")} – ${end.toFormat("d.M. HH:mm")}`;
  return `${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`;
}

/** Artwork paths are relative; the script prefixes its own app address. */
function toWidgetEvent(ev: ListedEvent, showArt: boolean): WidgetEvent {
  const start = toDt(ev.startAt);
  const end = toDt(ev.endAt);
  const kind = eventArtKindFor({
    summary: ev.summary,
    description: ev.description,
    calendarSummary: ev.calendarSummary,
    eventType: ev.eventType,
    source: ev.source,
  });
  return {
    id: ev.id,
    title: ev.summary?.trim() || "Ohne Titel",
    start: ev.allDay ? null : start?.toISO() ?? null,
    end: ev.allDay ? null : end?.toISO() ?? null,
    allDay: ev.allDay,
    time: timeLabel(ev, start, end),
    location: ev.location?.split("\n")[0]?.trim() || null,
    color: ev.backgroundColor || "#5ac8fa",
    calendar: ev.calendarSummary,
    art: showArt ? eventArtThumbSrc(kind, "side") : null,
    artHeader: showArt ? eventArtThumbSrc(kind, "header") : null,
  };
}

function dayLabel(day: DateTime, today: DateTime): string {
  const diff = Math.round(day.startOf("day").diff(today.startOf("day"), "days").days);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  return day.setLocale("de").toFormat("cccc, d.");
}

function overlapsDay(ev: ListedEvent, day: DateTime): boolean {
  const dayStart = day.startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  if (ev.allDay) {
    const s = ev.allDayStart ? DateTime.fromISO(ev.allDayStart, { zone: TZ }) : null;
    const e = ev.allDayEnd ? DateTime.fromISO(ev.allDayEnd, { zone: TZ }) : s?.plus({ days: 1 });
    return Boolean(s && e && s < dayEnd && e > dayStart);
  }
  const s = toDt(ev.startAt);
  const e = toDt(ev.endAt) ?? s;
  if (!s || !e) return false;
  // Zero-length events still belong to their day.
  return s < dayEnd && (e > dayStart || +e === +s);
}

async function buildDays(
  user: UserRow,
  config: WidgetConfig,
  now: DateTime,
): Promise<{ days: WidgetDay[]; next: WidgetEvent | null }> {
  const from = now.startOf("day");
  const to = from.plus({ days: LOOKAHEAD_DAYS });
  let events = await listEventsForUser(user, from, to, config.calendarIds);
  if (!config.showAllDay) events = events.filter((e) => !e.allDay);
  if (config.hideDeclined) events = events.filter((e) => !isDeclinedBySelf(e));

  const sortKey = (e: ListedEvent) =>
    e.allDay ? Number.NEGATIVE_INFINITY : (toDt(e.startAt)?.toMillis() ?? 0);

  const days: WidgetDay[] = [];
  for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
    const day = from.plus({ days: i }).setLocale("de");
    const todays = events
      .filter((e) => overlapsDay(e, day))
      .sort((a, b) => sortKey(a) - sortKey(b))
      .slice(0, MAX_EVENTS_PER_DAY)
      .map((e) => toWidgetEvent(e, config.showArt));
    days.push({
      date: day.toISODate() ?? "",
      label: dayLabel(day, now),
      weekday: day.toFormat("cccc"),
      day: day.day,
      events: todays,
    });
  }

  const upcoming = events
    .filter((e) => !e.allDay && (toDt(e.endAt) ?? toDt(e.startAt))! > now)
    .sort((a, b) => sortKey(a) - sortKey(b))[0];
  const allDayToday = days[0]?.events.find((e) => e.allDay) ?? null;
  const next = upcoming ? toWidgetEvent(upcoming, config.showArt) : allDayToday;
  return { days, next };
}

function mailTime(raw: string | undefined, internalDate: string | null | undefined, now: DateTime): string {
  const ms = internalDate ? Number(internalDate) : raw ? Date.parse(raw) : NaN;
  if (!Number.isFinite(ms)) return "";
  const dt = DateTime.fromMillis(ms).setZone(TZ).setLocale("de");
  if (dt.hasSame(now, "day")) return dt.toFormat("HH:mm");
  if (dt.hasSame(now.minus({ days: 1 }), "day")) return "Gestern";
  if (now.diff(dt, "days").days < 6) return dt.toFormat("ccc");
  return dt.toFormat("d.M.");
}

const mailCache = new Map<string, { at: number; value: NonNullable<WidgetPayload["mail"]> }>();

async function buildMail(
  user: UserRow,
  widgetId: string,
  preview: boolean,
  now: DateTime,
): Promise<NonNullable<WidgetPayload["mail"]>> {
  const key = `${widgetId}:${preview ? 1 : 0}`;
  const hit = mailCache.get(key);
  if (hit && Date.now() - hit.at < MAIL_CACHE_MS) return hit.value;
  try {
    const gmail = await getAuthedGmail(user);
    const { data: inbox } = await gmail.users.labels.get({ userId: "me", id: "INBOX" });
    const unread = inbox.threadsUnread ?? inbox.messagesUnread ?? 0;
    let items: WidgetMailItem[] = [];
    if (preview) {
      const { data: list } = await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        maxResults: 6,
      });
      const messages = await Promise.all(
        (list.messages ?? []).map((m) =>
          gmail.users.messages
            .get({
              userId: "me",
              id: m.id!,
              format: "metadata",
              metadataHeaders: ["From", "Subject", "Date"],
            })
            .then((r) => r.data)
            .catch(() => null),
        ),
      );
      items = messages
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((m) => {
          const h = headerMap(m.payload?.headers);
          const from = parseAddress(h.from);
          return {
            from: from.name || from.email || "Unbekannt",
            subject: h.subject?.trim() || "(kein Betreff)",
            time: mailTime(h.date, m.internalDate, now),
            unread: (m.labelIds ?? []).includes("UNREAD"),
          };
        });
    }
    const value = { unread, items, error: null };
    mailCache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    const needsLogin = isInsufficientScope(err) || err instanceof GoogleAuthError || isAuthError(err);
    const error = needsLogin
      ? "Google-Zugang abgelaufen. In der App neu mit Google anmelden."
      : "Mail gerade nicht erreichbar.";
    if (!needsLogin) console.warn("Widget-Mail:", err);
    return { unread: null, items: [], error };
  }
}

async function buildTasks(user: UserRow, now: DateTime): Promise<WidgetTask[]> {
  try {
    const api = await getAuthedTasks(user);
    const { data: lists } = await api.tasklists.list({ maxResults: 10 });
    const all: { title: string; due: string | null }[] = [];
    for (const list of lists.items ?? []) {
      if (!list.id) continue;
      const { data } = await api.tasks.list({
        tasklist: list.id,
        showCompleted: false,
        showHidden: false,
        maxResults: 50,
      });
      for (const t of data.items ?? []) {
        if (t.deleted || t.status === "completed" || !t.title?.trim()) continue;
        all.push({ title: t.title.trim(), due: t.due ? t.due.slice(0, 10) : null });
      }
    }
    const today = now.toISODate() ?? "";
    return all
      .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))
      .slice(0, 6)
      .map((t) => ({
        title: t.title,
        due: t.due
          ? t.due === today
            ? "Heute"
            : DateTime.fromISO(t.due, { zone: TZ }).setLocale("de").toFormat("d.M.")
          : null,
        overdue: Boolean(t.due && t.due < today),
      }));
  } catch (err) {
    if (!isInsufficientScope(err) && !(err instanceof GoogleAuthError) && !isAuthError(err)) {
      console.warn("Widget-Aufgaben:", err);
    }
    return [];
  }
}

export async function buildWidgetPayload(
  user: UserRow,
  widget: WidgetRow,
  appUrl: string,
  kindOverride?: WidgetKind,
): Promise<WidgetPayload> {
  const now = DateTime.now().setZone(TZ).setLocale("de");
  const kind = kindOverride ?? widget.kind;
  const config = widget.config;
  const wantsMail = kind === "mail" || kind === "day";
  const wantsTasks = kind === "day" && config.showTasks;

  const [{ days, next }, mail, tasks] = await Promise.all([
    kind === "mail" ? Promise.resolve({ days: [], next: null }) : buildDays(user, config, now),
    wantsMail ? buildMail(user, widget.id, config.mailPreview, now) : Promise.resolve(null),
    wantsTasks ? buildTasks(user, now) : Promise.resolve(null),
  ]);

  return {
    version: 1,
    generatedAt: now.toISO() ?? new Date().toISOString(),
    timezone: TZ,
    appUrl,
    widget: { id: widget.id, name: widget.name, kind, config },
    today: {
      date: now.toISODate() ?? "",
      weekday: now.toFormat("cccc"),
      weekdayShort: now.toFormat("ccc").replace(".", ""),
      day: now.day,
      month: now.toFormat("LLLL"),
      week: now.weekNumber,
    },
    next,
    days,
    mail,
    tasks,
  };
}

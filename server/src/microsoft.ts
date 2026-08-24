import { DateTime } from "luxon";
import {
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_REDIRECT_URI,
  MS_SCOPES,
  MS_TENANT_ID,
  TZ,
  msConfigured,
} from "./config.js";
import { decrypt, encrypt } from "./crypto.js";
import { query } from "./db.js";
import type { AttendeeJson, CalendarRow, EventRow, UserRow } from "./types.js";

const AUTH = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";
export const MS_CAL_PREFIX = "ms:";
export const MS_EVENT_BLUE = "#0078D4";

export class MsAuthError extends Error {
  constructor(
    message: string,
    public code: "reauth" | "forbidden" | "config" = "reauth",
  ) {
    super(message);
  }
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
};

export function msAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: MS_REDIRECT_URI,
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${AUTH}/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      ...body,
    }),
  });
  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new MsAuthError(data.error_description || data.error || "Microsoft-Token fehlgeschlagen.");
  }
  return data;
}

export async function exchangeMsCode(code: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: MS_REDIRECT_URI,
    scope: MS_SCOPES.join(" "),
  });
}

export async function graphGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (res.status === 401) throw new MsAuthError("Microsoft-Sitzung abgelaufen.", "reauth");
  if (res.status === 403) throw new MsAuthError("Microsoft-Berechtigung fehlt.", "forbidden");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text.slice(0, 240)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function graphSend(
  accessToken: string,
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new MsAuthError("Microsoft-Sitzung abgelaufen.", "reauth");
  if (res.status === 403) throw new MsAuthError("Microsoft-Berechtigung fehlt.", "forbidden");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text.slice(0, 240)}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return null;
  return res.json();
}

export async function getMsAccessToken(user: UserRow): Promise<string> {
  if (!msConfigured()) throw new MsAuthError("Microsoft ist nicht konfiguriert.", "config");
  if (!user.ms_refresh_token_enc) throw new MsAuthError("Microsoft nicht verbunden.", "reauth");
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: decrypt(user.ms_refresh_token_enc),
    scope: MS_SCOPES.join(" "),
  });
  if (tokens.refresh_token) {
    await query(
      `UPDATE users SET ms_refresh_token_enc = $2, ms_token_expiry = $3 WHERE id = $1`,
      [
        user.id,
        encrypt(tokens.refresh_token),
        tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      ],
    );
  }
  return tokens.access_token;
}

export type MsProfile = { id: string; mail?: string; userPrincipalName?: string; displayName?: string };

export async function fetchMsProfile(accessToken: string): Promise<MsProfile> {
  return graphGet<MsProfile>(accessToken, "/me?$select=id,mail,userPrincipalName,displayName");
}

type GraphCalendar = {
  id: string;
  name?: string;
  color?: string;
  hexColor?: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
  owner?: { name?: string; address?: string };
};

type GraphEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  showAs?: string;
  webLink?: string;
  iCalUId?: string;
  seriesMasterId?: string;
  attendees?: { emailAddress?: { address?: string; name?: string }; status?: { response?: string }; type?: string }[];
  onlineMeeting?: { joinUrl?: string };
  isCancelled?: boolean;
};

function mapMsEvent(
  item: GraphEvent,
  userId: string,
  calendarId: string,
): Omit<EventRow, "id" | "updated_at"> | null {
  if (!item.id || item.isCancelled) return null;
  const allDay = Boolean(item.isAllDay);
  let startAt: Date | null = null;
  let endAt: Date | null = null;
  let allDayStart: string | null = null;
  let allDayEnd: string | null = null;
  const timezone = item.start?.timeZone || TZ;

  if (allDay && item.start?.dateTime && item.end?.dateTime) {
    allDayStart = item.start.dateTime.slice(0, 10);
    allDayEnd = item.end.dateTime.slice(0, 10);
    startAt = DateTime.fromISO(allDayStart, { zone: TZ }).startOf("day").toJSDate();
    endAt = DateTime.fromISO(allDayEnd, { zone: TZ }).startOf("day").toJSDate();
  } else if (item.start?.dateTime && item.end?.dateTime) {
    // Graph often returns local wall time without Z; interpret in event TZ.
    const start = DateTime.fromISO(item.start.dateTime, { zone: item.start.timeZone || TZ });
    const end = DateTime.fromISO(item.end.dateTime, { zone: item.end.timeZone || TZ });
    startAt = start.isValid ? start.toJSDate() : new Date(item.start.dateTime);
    endAt = end.isValid ? end.toJSDate() : new Date(item.end.dateTime);
  }

  const attendees: AttendeeJson[] | null = item.attendees?.length
    ? item.attendees
        .filter((a) => a.emailAddress?.address)
        .map((a) => ({
          email: a.emailAddress!.address!,
          displayName: a.emailAddress?.name,
          responseStatus: a.status?.response,
          resource: a.type === "resource",
        }))
    : null;

  return {
    user_id: userId,
    calendar_id: calendarId,
    google_event_id: item.id,
    ical_uid: item.iCalUId ?? null,
    summary: item.subject ?? null,
    description: item.body?.contentType === "text" ? item.body.content ?? null : item.bodyPreview ?? null,
    location: item.location?.displayName ?? null,
    status: item.showAs === "free" ? "tentative" : "confirmed",
    html_link: item.webLink ?? null,
    hangout_link: item.onlineMeeting?.joinUrl ?? null,
    start_at: startAt,
    end_at: endAt,
    all_day: allDay,
    all_day_start: allDayStart,
    all_day_end: allDayEnd,
    timezone,
    attendees,
    recurrence: null,
    recurring_event_id: item.seriesMasterId ?? null,
    transparency: item.showAs === "free" ? "transparent" : "opaque",
    visibility: null,
    conference_data: item.onlineMeeting ? { joinUrl: item.onlineMeeting.joinUrl } : null,
    event_type: "default",
    reminders: null,
    attachments: null,
  };
}

async function upsertMsCalendar(userId: string, cal: GraphCalendar): Promise<CalendarRow> {
  const googleCalId = `${MS_CAL_PREFIX}${cal.id}`;
  const bg = cal.hexColor && cal.hexColor !== "auto" ? cal.hexColor : MS_EVENT_BLUE;
  const { rows } = await query<CalendarRow>(
    `INSERT INTO calendars (
       user_id, google_cal_id, summary, color, background_color, foreground_color,
       timezone, selected, primary_cal, access_role, source, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,'microsoft',NOW())
     ON CONFLICT (user_id, google_cal_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       background_color = COALESCE(EXCLUDED.background_color, calendars.background_color),
       access_role = EXCLUDED.access_role,
       primary_cal = EXCLUDED.primary_cal,
       source = 'microsoft',
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      googleCalId,
      cal.name || "Microsoft-Kalender",
      bg,
      bg,
      "#ffffff",
      TZ,
      Boolean(cal.isDefaultCalendar),
      cal.canEdit === false ? "reader" : "owner",
    ],
  );
  return rows[0];
}

async function upsertMsEvent(row: Omit<EventRow, "id" | "updated_at">): Promise<void> {
  await query(
    `INSERT INTO events (
       user_id, calendar_id, google_event_id, ical_uid, summary, description, location,
       status, html_link, hangout_link, start_at, end_at, all_day, all_day_start, all_day_end,
       timezone, attendees, recurrence, recurring_event_id, transparency, visibility,
       conference_data, event_type, reminders, attachments, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20,$21,
       $22::jsonb,$23,$24::jsonb,$25::jsonb,NOW()
     )
     ON CONFLICT (calendar_id, google_event_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       description = EXCLUDED.description,
       location = EXCLUDED.location,
       status = EXCLUDED.status,
       html_link = EXCLUDED.html_link,
       hangout_link = EXCLUDED.hangout_link,
       start_at = EXCLUDED.start_at,
       end_at = EXCLUDED.end_at,
       all_day = EXCLUDED.all_day,
       all_day_start = EXCLUDED.all_day_start,
       all_day_end = EXCLUDED.all_day_end,
       timezone = EXCLUDED.timezone,
       attendees = EXCLUDED.attendees,
       conference_data = EXCLUDED.conference_data,
       updated_at = NOW()`,
    [
      row.user_id,
      row.calendar_id,
      row.google_event_id,
      row.ical_uid,
      row.summary,
      row.description,
      row.location,
      row.status,
      row.html_link,
      row.hangout_link,
      row.start_at,
      row.end_at,
      row.all_day,
      row.all_day_start,
      row.all_day_end,
      row.timezone,
      row.attendees ? JSON.stringify(row.attendees) : null,
      row.recurrence ? JSON.stringify(row.recurrence) : null,
      row.recurring_event_id,
      row.transparency,
      row.visibility,
      row.conference_data ? JSON.stringify(row.conference_data) : null,
      row.event_type,
      row.reminders ? JSON.stringify(row.reminders) : null,
      row.attachments ? JSON.stringify(row.attachments) : null,
    ],
  );
}

export async function syncMicrosoftCalendars(
  user: UserRow,
  timeMin?: string,
  timeMax?: string,
): Promise<number> {
  if (!user.ms_refresh_token_enc) return 0;
  const token = await getMsAccessToken(user);
  const list = await graphGet<{ value?: GraphCalendar[] }>(token, "/me/calendars?$top=100");
  const calendars = list.value ?? [];
  let count = 0;
  const now = DateTime.now().setZone(TZ);
  const from = timeMin ?? now.minus({ months: 1 }).startOf("day").toUTC().toISO()!;
  const to = timeMax ?? now.plus({ months: 2 }).endOf("day").toUTC().toISO()!;

  for (const cal of calendars) {
    if (!cal.id) continue;
    const row = await upsertMsCalendar(user.id, cal);
    count += 1;
    if (!row.selected) continue;
    const graphId = cal.id;
    const path =
      `/me/calendars/${encodeURIComponent(graphId)}/calendarView` +
      `?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}` +
      `&$top=250&$orderby=start/dateTime`;
    const seen = new Set<string>();
    let next: string | null = path;
    while (next) {
      type Page = { value?: GraphEvent[]; "@odata.nextLink"?: string };
      let page: Page;
      if (next.startsWith("http")) {
        const res = await fetch(next, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Graph calendarView ${res.status}`);
        page = (await res.json()) as Page;
      } else {
        page = await graphGet<Page>(token, next);
      }
      for (const ev of page.value ?? []) {
        const mapped = mapMsEvent(ev, user.id, row.id);
        if (!mapped) continue;
        seen.add(mapped.google_event_id);
        await upsertMsEvent(mapped);
      }
      next = page["@odata.nextLink"] ?? null;
    }
    // Remove MS events in range that vanished
    await query(
      `DELETE FROM events
        WHERE calendar_id = $1
          AND all_day = FALSE
          AND start_at < $3::timestamptz AND end_at > $2::timestamptz
          AND NOT (google_event_id = ANY($4::text[]))`,
      [row.id, from, to, [...seen]],
    );
  }
  return count;
}

export function graphCalId(googleCalId: string): string {
  return googleCalId.startsWith(MS_CAL_PREFIX) ? googleCalId.slice(MS_CAL_PREFIX.length) : googleCalId;
}

export async function patchMsEvent(
  user: UserRow,
  calendar: CalendarRow,
  eventId: string,
  body: {
    summary?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    location?: string;
    description?: string;
    timezone?: string;
  },
): Promise<void> {
  const token = await getMsAccessToken(user);
  const tz = body.timezone || calendar.timezone || TZ;
  const payload: Record<string, unknown> = {};
  if (body.summary !== undefined) payload.subject = body.summary;
  if (body.location !== undefined) payload.location = { displayName: body.location };
  if (body.description !== undefined) {
    payload.body = { contentType: "text", content: body.description };
  }
  if (body.start && body.end) {
    if (body.allDay) {
      payload.isAllDay = true;
      payload.start = { dateTime: body.start.slice(0, 10), timeZone: tz };
      payload.end = { dateTime: body.end.slice(0, 10), timeZone: tz };
    } else {
      payload.isAllDay = false;
      payload.start = { dateTime: DateTime.fromISO(body.start, { setZone: true }).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz };
      payload.end = { dateTime: DateTime.fromISO(body.end, { setZone: true }).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz };
    }
  }
  await graphSend(token, `/me/events/${encodeURIComponent(eventId)}`, "PATCH", payload);
}

export async function deleteMsEvent(user: UserRow, eventId: string): Promise<void> {
  const token = await getMsAccessToken(user);
  await graphSend(token, `/me/events/${encodeURIComponent(eventId)}`, "DELETE");
}

export type MsTodoTask = {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  status: "needsAction" | "completed";
  due: string | null;
  notes?: string;
};

export async function listMsTodos(user: UserRow): Promise<MsTodoTask[]> {
  if (!user.ms_refresh_token_enc) return [];
  const token = await getMsAccessToken(user);
  const lists = await graphGet<{ value?: { id: string; displayName?: string }[] }>(
    token,
    "/me/todo/lists?$top=50",
  );
  const out: MsTodoTask[] = [];
  for (const list of lists.value ?? []) {
    if (!list.id) continue;
    const tasks = await graphGet<{
      value?: {
        id: string;
        title?: string;
        status?: string;
        dueDateTime?: { dateTime?: string };
        body?: { content?: string };
      }[];
    }>(token, `/me/todo/lists/${encodeURIComponent(list.id)}/tasks?$top=100`);
    for (const t of tasks.value ?? []) {
      if (!t.id) continue;
      out.push({
        id: `ms:${list.id}:${t.id}`,
        listId: `ms:${list.id}`,
        listTitle: list.displayName || "To Do",
        title: t.title || "Aufgabe",
        status: t.status === "completed" ? "completed" : "needsAction",
        due: t.dueDateTime?.dateTime?.slice(0, 10) ?? null,
        notes: t.body?.content,
      });
    }
  }
  return out;
}

export type MsPlanTask = {
  id: string;
  planId: string;
  planTitle: string;
  title: string;
  percentComplete: number;
  due: string | null;
};

export async function listMsPlanner(user: UserRow): Promise<MsPlanTask[]> {
  if (!user.ms_refresh_token_enc) return [];
  try {
    const token = await getMsAccessToken(user);
    const plans = await graphGet<{ value?: { id: string; title?: string }[] }>(token, "/me/planner/plans");
    const out: MsPlanTask[] = [];
    for (const plan of plans.value ?? []) {
      if (!plan.id) continue;
      const tasks = await graphGet<{
        value?: {
          id: string;
          title?: string;
          percentComplete?: number;
          dueDateTime?: string;
        }[];
      }>(token, `/planner/plans/${encodeURIComponent(plan.id)}/tasks`);
      for (const t of tasks.value ?? []) {
        if (!t.id) continue;
        out.push({
          id: `msplan:${t.id}`,
          planId: plan.id,
          planTitle: plan.title || "Plan",
          title: t.title || "Aufgabe",
          percentComplete: t.percentComplete ?? 0,
          due: t.dueDateTime?.slice(0, 10) ?? null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

import type { CalendarEvent, CalendarItem, Me } from "./types";
import type { MailLabel, MailThread, MailThreadSummary } from "@/mail/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  const data = (await parse(res)) as { error?: string; code?: string } | null;
  if (!res.ok) {
    throw new ApiError(
      data?.error ?? "Die Anfrage ist fehlgeschlagen.",
      res.status,
      data?.code,
    );
  }
  return data as T;
}

export const apiClient = {
  me: () => api<Me>("/api/me"),
  patchMe: (body: {
    weekStart?: 0 | 1;
    notifyCalendar?: boolean;
    notifyMail?: boolean;
  }) =>
    api<Me>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  pushVapid: () => api<{ publicKey: string }>("/api/push/vapid"),
  pushSubscribe: (sub: PushSubscriptionJSON) =>
    api<{ ok: boolean }>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(sub),
    }),
  pushUnsubscribe: (endpoint?: string) =>
    api<{ ok: boolean }>("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),
  pushTest: () => api<{ ok: boolean; sent: number }>("/api/push/test", { method: "POST" }),
  aiMailSummary: (id: string, threaded = true) =>
    api<{ text: string; cached: boolean }>("/api/ai/mail", {
      method: "POST",
      body: JSON.stringify({ id, threaded }),
    }),
  aiCalendarBriefing: (from: string, to: string) =>
    api<{ text: string; cached: boolean }>("/api/ai/calendar", {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  logout: () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  calendars: () => api<{ calendars: CalendarItem[] }>("/api/calendars"),
  patchCalendar: (id: string, selected: boolean) =>
    api<{ id: string; selected: boolean }>(`/api/calendars/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ selected }),
    }),
  events: (from: string, to: string, calendarIds?: string[]) => {
    const q = new URLSearchParams({ from, to });
    if (calendarIds?.length) q.set("calendarIds", calendarIds.join(","));
    return api<{ events: CalendarEvent[] }>(`/api/events?${q}`);
  },
  createEvent: (body: unknown) =>
    api<{ event: CalendarEvent | null }>("/api/events", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchEvent: (id: string, body: unknown) =>
    api<{ event: CalendarEvent | null }>(`/api/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteEvent: (id: string, scope?: string) =>
    api<{ ok: boolean }>(`/api/events/${id}?scope=${scope ?? "this"}`, {
      method: "DELETE",
    }),
  rsvp: (id: string, responseStatus: string) =>
    api<{ event: CalendarEvent | null }>(`/api/events/${id}/rsvp`, {
      method: "POST",
      body: JSON.stringify({ responseStatus }),
    }),
  search: (q: string) =>
    api<{ events: CalendarEvent[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  sync: (timeMin?: string, timeMax?: string) =>
    api<{ ok: boolean; lastSyncAt: string }>("/api/sync", {
      method: "POST",
      body: JSON.stringify({ timeMin, timeMax }),
    }),
  mailLabels: () => api<{ labels: MailLabel[] }>("/api/mail/labels"),
  mailThreads: (opts: {
    labelId?: string;
    q?: string;
    pageToken?: string;
    threaded?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (opts.labelId) query.set("labelId", opts.labelId);
    if (opts.q) query.set("q", opts.q);
    if (opts.pageToken) query.set("pageToken", opts.pageToken);
    const path = opts.threaded === false ? "/api/mail/messages" : "/api/mail/threads";
    return api<{
      threads: MailThreadSummary[];
      nextPageToken: string | null;
      resultSizeEstimate: number;
    }>(`${path}?${query}`);
  },
  mailThread: (id: string, threaded = true) =>
    api<MailThread>(
      threaded
        ? `/api/mail/threads/${encodeURIComponent(id)}`
        : `/api/mail/messages/${encodeURIComponent(id)}`,
    ),
  mailModify: (id: string, addLabelIds: string[], removeLabelIds: string[], threaded = true) =>
    api<{ ok: boolean }>(
      `/api/mail/${threaded ? "threads" : "messages"}/${encodeURIComponent(id)}/modify`,
      {
        method: "POST",
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
      },
    ),
  mailTrash: (id: string, threaded = true) =>
    api<{ ok: boolean }>(
      `/api/mail/${threaded ? "threads" : "messages"}/${encodeURIComponent(id)}/trash`,
      { method: "POST" },
    ),
  mailUntrash: (id: string, threaded = true) =>
    api<{ ok: boolean }>(
      `/api/mail/${threaded ? "threads" : "messages"}/${encodeURIComponent(id)}/untrash`,
      { method: "POST" },
    ),
  mailSend: (body: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }) =>
    api<{ ok: boolean; id?: string; threadId?: string }>("/api/mail/send", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

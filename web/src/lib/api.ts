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
  patchMe: (weekStart: 0 | 1) =>
    api<{ weekStart: 0 | 1 }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ weekStart }),
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
  mailThreads: (opts: { labelId?: string; q?: string; pageToken?: string }) => {
    const query = new URLSearchParams();
    if (opts.labelId) query.set("labelId", opts.labelId);
    if (opts.q) query.set("q", opts.q);
    if (opts.pageToken) query.set("pageToken", opts.pageToken);
    return api<{
      threads: MailThreadSummary[];
      nextPageToken: string | null;
      resultSizeEstimate: number;
    }>(`/api/mail/threads?${query}`);
  },
  mailThread: (id: string) => api<MailThread>(`/api/mail/threads/${encodeURIComponent(id)}`),
  mailModify: (id: string, addLabelIds: string[], removeLabelIds: string[]) =>
    api<{ ok: boolean }>(`/api/mail/threads/${encodeURIComponent(id)}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    }),
  mailTrash: (id: string) =>
    api<{ ok: boolean }>(`/api/mail/threads/${encodeURIComponent(id)}/trash`, {
      method: "POST",
    }),
  mailUntrash: (id: string) =>
    api<{ ok: boolean }>(`/api/mail/threads/${encodeURIComponent(id)}/untrash`, {
      method: "POST",
    }),
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

import type { CalendarEvent, CalendarItem, Me } from "./types";

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
};

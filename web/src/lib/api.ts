import type { CalendarEvent, CalendarItem, Me, TaskItem } from "./types";
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
    hideDeclined?: boolean;
    secondTimezone?: string | null;
    workingHours?: {
      enabled: boolean;
      days: Record<string, { start: string; end: string } | null>;
    };
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
  sync: (timeMin?: string, timeMax?: string, full = false) =>
    api<{ ok: boolean; lastSyncAt: string }>("/api/sync", {
      method: "POST",
      body: JSON.stringify({ timeMin, timeMax, full }),
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
    text?: string;
    html?: string;
    from?: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    draftId?: string;
    attachments?: { filename: string; mimeType: string; data: string }[];
    forwardAttachments?: {
      messageId: string;
      attachmentId: string;
      filename: string;
      mimeType: string;
    }[];
  }) =>
    api<{ ok: boolean; id?: string; threadId?: string }>("/api/mail/send", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mailDraft: (body: {
    draftId?: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    from?: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: { filename: string; mimeType: string; data: string }[];
    forwardAttachments?: {
      messageId: string;
      attachmentId: string;
      filename: string;
      mimeType: string;
    }[];
  }) =>
    api<{ ok: boolean; id?: string; threadId?: string }>("/api/mail/drafts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mailDraftGet: (id: string) =>
    api<{ id: string; message: import("@/mail/types").MailMessage | null }>(
      `/api/mail/drafts/${encodeURIComponent(id)}`,
    ),
  mailDraftDelete: (id: string) =>
    api<{ ok: boolean }>(`/api/mail/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mailLabelColor: (id: string, backgroundColor: string, textColor: string) =>
    api<{ id: string }>(`/api/mail/labels/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ backgroundColor, textColor }),
    }),
  mailCreateLabel: (name: string) =>
    api<{ id: string; name: string }>("/api/mail/labels", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  mailRenameLabel: (id: string, name: string) =>
    api<{ id: string; name: string }>(`/api/mail/labels/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  mailDeleteLabel: (id: string) =>
    api<{ ok: boolean }>(`/api/mail/labels/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mailSaveToDrive: (messageId: string, attachmentId: string, filename: string, mime: string) =>
    api<{ ok: boolean; url?: string }>(
      `/api/mail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/drive?filename=${encodeURIComponent(filename)}&mime=${encodeURIComponent(mime)}`,
      { method: "POST" },
    ),
  mailToEvent: (body: {
    messageId?: string;
    attachmentId?: string;
    event?: {
      summary: string;
      start: string;
      end: string;
      allDay?: boolean;
      location?: string;
      description?: string;
    };
  }) =>
    api<{ ok: boolean; googleEventId?: string | null }>("/api/mail/to-event", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mailBlock: (from: string, threadId?: string) =>
    api<{ ok: boolean }>("/api/mail/block", {
      method: "POST",
      body: JSON.stringify({ from, threadId }),
    }),
  contacts: (q?: string) =>
    api<{
      contacts: {
        resourceName: string;
        name: string;
        emails: string[];
        phones: { value: string; type?: string }[];
        photoUrl: string | null;
        birthday: { month: number; day: number; year?: number } | null;
        organization?: string | null;
      }[];
    }>(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  icsFeeds: () =>
    api<{
      feeds: {
        id: string;
        url: string;
        name: string | null;
        calendarId: string;
        lastSyncAt: string | null;
        lastError: string | null;
      }[];
    }>("/api/calendars/ics-feeds"),
  subscribeIcs: (url: string, name?: string) =>
    api<{ feedId: string; calendarId: string; count: number }>("/api/calendars/ics-feeds", {
      method: "POST",
      body: JSON.stringify({ url, name }),
    }),
  deleteIcsFeed: (id: string) =>
    api<{ ok: boolean }>(`/api/calendars/ics-feeds/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mailSendAs: () =>
    api<{
      aliases: {
        sendAsEmail: string;
        displayName: string;
        isDefault: boolean;
        isPrimary: boolean;
        signature: string;
      }[];
    }>("/api/mail/send-as"),
  mailSaveSignature: (email: string, signature: string) =>
    api<{ ok: boolean; signature: string }>(
      `/api/mail/send-as/${encodeURIComponent(email)}/signature`,
      { method: "PUT", body: JSON.stringify({ signature }) },
    ),
  mailVacation: () =>
    api<{
      enableAutoReply: boolean;
      responseSubject: string;
      responseBodyHtml: string;
      responseBodyPlainText: string;
      restrictToContacts: boolean;
      restrictToDomain: boolean;
      startTime: string | null;
      endTime: string | null;
    }>("/api/mail/vacation"),
  mailSaveVacation: (body: unknown) =>
    api<{ enableAutoReply: boolean }>("/api/mail/vacation", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  mailFilters: () =>
    api<{
      filters: {
        id?: string | null;
        criteria: Record<string, unknown>;
        action: Record<string, unknown>;
      }[];
    }>("/api/mail/filters"),
  mailCreateFilter: (body: unknown) =>
    api<{ filter: { id?: string | null } }>("/api/mail/filters", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mailDeleteFilter: (id: string) =>
    api<{ ok: boolean }>(`/api/mail/filters/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mailContacts: (q: string) =>
    api<{ contacts: { name: string; email: string }[] }>(
      `/api/mail/contacts?q=${encodeURIComponent(q)}`,
    ),
  rooms: () =>
    api<{ rooms: { id: string; summary: string | null }[]; hint: string | null }>(
      "/api/calendars/rooms",
    ),
  freeBusy: (emails: string[], timeMin: string, timeMax: string) =>
    api<{ calendars: { id: string; busy: { start?: string | null; end?: string | null }[] }[] }>(
      "/api/events/freebusy",
      { method: "POST", body: JSON.stringify({ emails, timeMin, timeMax }) },
    ),
  findTime: (emails: string[], durationMin: 30 | 60) =>
    api<{ slots: { start: string; end: string }[]; durationMin: number }>("/api/events/find-time", {
      method: "POST",
      body: JSON.stringify({ emails, durationMin }),
    }),
  calendarSettings: () =>
    api<{
      googleSettings: { id?: string | null; value?: string | null }[];
      workingHours: Me["workingHours"];
      googleWorkingHoursSupported: boolean;
      note: string;
    }>("/api/me/calendar-settings"),
  tasks: () =>
    api<{ lists: { id?: string | null; title: string }[]; tasks: TaskItem[] }>("/api/tasks"),
  createTask: (body: { title: string; listId?: string; due?: string; notes?: string }) =>
    api<{ task: TaskItem }>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  patchTask: (
    listId: string,
    id: string,
    body: { title?: string; status?: string; due?: string | null; notes?: string },
  ) =>
    api<{ task: TaskItem }>(`/api/tasks/${encodeURIComponent(listId)}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTask: (listId: string, id: string) =>
    api<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(listId)}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  mapsPreview: (q: string) =>
    api<{ lat: number | null; lon: number | null; label?: string }>(
      `/api/maps/preview?q=${encodeURIComponent(q)}`,
    ),
  mapsSuggest: (q: string, init?: RequestInit) =>
    api<{ places: { label: string; lat: number; lon: number }[] }>(
      `/api/maps/suggest?q=${encodeURIComponent(q)}`,
      init,
    ),
};

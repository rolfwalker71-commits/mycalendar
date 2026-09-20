// Home-screen widget (Scriptable) contract, shared by server and app.

export type WidgetKind = "calendar" | "mail" | "day";

export const WIDGET_KINDS: { value: WidgetKind; label: string; hint: string }[] = [
  { value: "calendar", label: "Kalender", hint: "Nächster Termin, heute, Agenda" },
  { value: "mail", label: "Mail", hint: "Ungelesene und neueste Mails" },
  { value: "day", label: "Mein Tag", hint: "Termine, Mails und Aufgaben" },
];

export type WidgetDays = 1 | 3 | 7;
/** Look of the small calendar widget: artwork header or a tear-off calendar sheet. */
export type WidgetSmallStyle = "art" | "sheet";

export type WidgetConfig = {
  /** Empty = the calendars currently visible in the app. */
  calendarIds: string[];
  showArt: boolean;
  showAllDay: boolean;
  hideDeclined: boolean;
  /** Days shown in the large calendar widget. */
  days: WidgetDays;
  smallStyle: WidgetSmallStyle;
  /** Off = only the unread count (nothing readable on the lock screen). */
  mailPreview: boolean;
  showTasks: boolean;
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  calendarIds: [],
  showArt: true,
  showAllDay: true,
  hideDeclined: true,
  days: 3,
  smallStyle: "sheet",
  mailPreview: true,
  showTasks: true,
};

export function isWidgetKind(value: unknown): value is WidgetKind {
  return value === "calendar" || value === "mail" || value === "day";
}

export function normalizeWidgetConfig(raw: unknown): WidgetConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (key: keyof WidgetConfig) =>
    typeof src[key] === "boolean" ? (src[key] as boolean) : (DEFAULT_WIDGET_CONFIG[key] as boolean);
  const days = Number(src.days);
  return {
    calendarIds: Array.isArray(src.calendarIds)
      ? [...new Set(src.calendarIds.filter((v): v is string => typeof v === "string" && v.length > 0))].slice(0, 100)
      : [],
    showArt: bool("showArt"),
    showAllDay: bool("showAllDay"),
    hideDeclined: bool("hideDeclined"),
    days: days === 1 || days === 7 ? days : 3,
    smallStyle: src.smallStyle === "art" ? "art" : "sheet",
    mailPreview: bool("mailPreview"),
    showTasks: bool("showTasks"),
  };
}

export type WidgetEvent = {
  id: string;
  title: string;
  /** ISO timestamp, null for all-day events. */
  start: string | null;
  end: string | null;
  allDay: boolean;
  /** Preformatted in the app time zone, e.g. "09:00–10:00" or "Ganztägig". */
  time: string;
  location: string | null;
  color: string;
  calendar: string | null;
  /** App-relative paths of the event artwork, null when artwork is switched off. */
  art: string | null;
  artHeader: string | null;
};

export type WidgetToday = {
  date: string;
  weekday: string;
  weekdayShort: string;
  day: number;
  month: string;
  monthShort: string;
  week: number;
};

export type WidgetDay = {
  date: string;
  /** "Heute", "Morgen", "Montag, 21." */
  label: string;
  weekday: string;
  day: number;
  events: WidgetEvent[];
};

export type WidgetMailItem = {
  from: string;
  subject: string;
  time: string;
  unread: boolean;
};

export type WidgetTask = {
  title: string;
  due: string | null;
  overdue: boolean;
};

export type WidgetPayload = {
  version: 1;
  generatedAt: string;
  timezone: string;
  appUrl: string;
  widget: { id: string; name: string; kind: WidgetKind; config: WidgetConfig };
  today: WidgetToday;
  next: WidgetEvent | null;
  days: WidgetDay[];
  mail: { unread: number | null; items: WidgetMailItem[]; error: string | null } | null;
  tasks: WidgetTask[] | null;
};

export type WidgetSummary = {
  id: string;
  name: string;
  kind: WidgetKind;
  config: WidgetConfig;
  createdAt: string;
  lastUsedAt: string | null;
};

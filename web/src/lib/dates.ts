import { DateTime, Settings } from "luxon";

export const ZONE = "Europe/Berlin";

Settings.defaultLocale = "de";
Settings.defaultZone = ZONE;

const DATE_INPUT_FORMATS = [
  "dd.MM.yyyy",
  "d.M.yyyy",
  "dd.MM.yy",
  "d.M.yy",
  "yyyy-MM-dd",
] as const;

const TIME_INPUT_FORMATS = ["HH:mm", "H:mm", "HH.mm", "H.mm"] as const;

export function now(): DateTime {
  return DateTime.now().setZone(ZONE).setLocale("de");
}

export function fromISO(value: string | null | undefined): DateTime | null {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { setZone: true }).setZone(ZONE).setLocale("de");
  return dt.isValid ? dt : null;
}

/** Normalizes date-only or Date-JSON (`…T00:00:00.000Z`) to `yyyy-MM-dd`. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = DateTime.fromISO(value, { setZone: true }).setZone(ZONE);
  return dt.isValid ? dt.toISODate() : value.slice(0, 10);
}

export function startOfWeek(dt: DateTime, weekStart: 0 | 1): DateTime {
  const weekday = dt.weekday; // 1 Mon .. 7 Sun
  if (weekStart === 1) {
    return dt.startOf("week");
  }
  const diff = weekday % 7;
  return dt.minus({ days: diff }).startOf("day");
}

export function endOfWeek(dt: DateTime, weekStart: 0 | 1): DateTime {
  return startOfWeek(dt, weekStart).plus({ days: 6 }).endOf("day");
}

const WEEKDAYS_DE = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"] as const;

export function weekdayLabels(weekStart: 0 | 1): string[] {
  if (weekStart === 1) return [...WEEKDAYS_DE];
  return [WEEKDAYS_DE[6], ...WEEKDAYS_DE.slice(0, 6)];
}

export function weekdayShort(weekStart: 0 | 1): string[] {
  return weekdayLabels(weekStart);
}

export function monthTitle(dt: DateTime): string {
  return dt.setLocale("de").toFormat("LLLL yyyy");
}

export function dayTitle(dt: DateTime): string {
  const parts = dayTitleParts(dt);
  return `${parts.weekday}, ${parts.date}`;
}

export function dayTitleParts(dt: DateTime): { weekday: string; date: string } {
  const d = dt.setLocale("de");
  return {
    weekday: d.toFormat("cccc"),
    date: d.toFormat("d. LLLL"),
  };
}

export function formatTime(dt: DateTime): string {
  return dt.setLocale("de").toFormat("HH:mm");
}

export function formatDate(dt: DateTime): string {
  return dt.setLocale("de").toFormat("dd.MM.yyyy");
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { zone: ZONE });
  return dt.isValid ? dt.toFormat("dd.MM.yyyy") : "";
}

/** Parses typed dates (`20.08.2026`, `20.8.26`, ISO) to `yyyy-MM-dd`. Empty → `""`, invalid → `null`. */
export function parseDateInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "";
  for (const fmt of DATE_INPUT_FORMATS) {
    const dt = DateTime.fromFormat(raw, fmt, { zone: ZONE, locale: "de" });
    if (dt.isValid) return dt.toISODate() ?? null;
  }
  return null;
}

/** Parses typed times (`18:15`, `18.15`, `9:00`) to `HH:mm`. Empty → `""`, invalid → `null`. */
export function parseTimeInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (/^\d{3,4}$/.test(digits) && !/[.:]/.test(raw)) {
    const dt = DateTime.fromFormat(digits.padStart(4, "0"), "HHmm");
    if (dt.isValid) return dt.toFormat("HH:mm");
  }
  for (const fmt of TIME_INPUT_FORMATS) {
    const dt = DateTime.fromFormat(raw, fmt);
    if (dt.isValid) return dt.toFormat("HH:mm");
  }
  return null;
}

export function formatDayHeading(dt: DateTime): string {
  return dt.setLocale("de").toFormat("cccc, d. LLLL yyyy");
}

export function isSameDay(a: DateTime, b: DateTime): boolean {
  return a.hasSame(b, "day");
}

export function roundTo15(dt: DateTime): DateTime {
  const m = Math.round(dt.minute / 15) * 15;
  if (m === 60) return dt.startOf("hour").plus({ hours: 1 });
  return dt.set({ minute: m, second: 0, millisecond: 0 });
}

export function eventStartsOn(event: {
  allDay: boolean;
  allDayStart: string | null;
  startAt: string | null;
}, day: DateTime): boolean {
  if (event.allDay && event.allDayStart) {
    return toIsoDate(event.allDayStart) === day.toISODate();
  }
  const start = fromISO(event.startAt);
  return start ? isSameDay(start, day) : false;
}

export function eventOverlapsDay(
  event: {
    allDay: boolean;
    allDayStart: string | null;
    allDayEnd: string | null;
    startAt: string | null;
    endAt: string | null;
  },
  day: DateTime,
): boolean {
  const dayStart = day.startOf("day");
  const dayEnd = day.endOf("day");
  if (event.allDay && event.allDayStart && event.allDayEnd) {
    const start = DateTime.fromISO(event.allDayStart, { zone: ZONE });
    const endEx = DateTime.fromISO(event.allDayEnd, { zone: ZONE });
    return start < dayEnd && endEx > dayStart;
  }
  const start = fromISO(event.startAt);
  const end = fromISO(event.endAt);
  if (!start || !end) return false;
  return start < dayEnd && end > dayStart;
}

export function visibleRange(
  cursor: DateTime,
  view: string,
  weekStart: 0 | 1,
): { from: DateTime; to: DateTime } {
  if (view === "day" || view === "agenda") {
    return {
      from: cursor.startOf("day").minus({ days: 1 }),
      to: view === "agenda" ? cursor.plus({ days: 90 }).endOf("day") : cursor.endOf("day").plus({ days: 1 }),
    };
  }
  if (view === "week") {
    const start = startOfWeek(cursor, weekStart);
    return { from: start.minus({ days: 1 }), to: start.plus({ days: 8 }).endOf("day") };
  }
  if (view === "year") {
    return {
      from: cursor.startOf("year").minus({ days: 7 }),
      to: cursor.endOf("year").plus({ days: 7 }),
    };
  }
  return {
    from: cursor.startOf("month").minus({ months: 1 }),
    to: cursor.endOf("month").plus({ months: 1 }),
  };
}

export function nthWeekdayOfMonth(dt: DateTime): { n: number; byday: string } {
  const map = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const n = Math.ceil(dt.day / 7);
  return { n: n >= 5 ? -1 : n, byday: map[dt.weekday] };
}

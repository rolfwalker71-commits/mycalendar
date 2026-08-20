import type { CalendarEvent } from "./types";
import { fromISO } from "./dates";
import type { DateTime } from "luxon";

export const HOUR_HEIGHT = 56;

export type LaidOutEvent = CalendarEvent & {
  col: number;
  cols: number;
  top: number;
  height: number;
};

function startMs(e: CalendarEvent, day: DateTime): number {
  const s = fromISO(e.startAt);
  if (!s) return day.startOf("day").toMillis();
  return Math.max(s.toMillis(), day.startOf("day").toMillis());
}

function endMs(e: CalendarEvent, day: DateTime): number {
  const t = fromISO(e.endAt);
  if (!t) return day.startOf("day").plus({ hours: 1 }).toMillis();
  return Math.min(t.toMillis(), day.endOf("day").toMillis());
}

export function packDayEvents(
  events: CalendarEvent[],
  day: DateTime,
): LaidOutEvent[] {
  const timed = events
    .filter((e) => !e.allDay)
    .slice()
    .sort((a, b) => startMs(a, day) - startMs(b, day) || endMs(a, day) - endMs(b, day));

  type Item = { event: CalendarEvent; start: number; end: number; col: number };
  const items: Item[] = timed.map((event) => {
    const start = startMs(event, day);
    let end = endMs(event, day);
    if (end <= start) end = start + 15 * 60 * 1000;
    return { event, start, end, col: 0 };
  });

  const colEnds: number[] = [];
  for (const item of items) {
    let col = 0;
    while (col < colEnds.length && colEnds[col] > item.start) col += 1;
    item.col = col;
    colEnds[col] = item.end;
  }

  const result: LaidOutEvent[] = [];
  for (const item of items) {
    let cols = item.col + 1;
    for (const other of items) {
      if (other === item) continue;
      if (other.start < item.end && other.end > item.start) {
        cols = Math.max(cols, other.col + 1);
      }
    }
    const dayStart = day.startOf("day").toMillis();
    const top = ((item.start - dayStart) / (60 * 60 * 1000)) * HOUR_HEIGHT;
    const height = Math.max(
      16,
      ((item.end - item.start) / (60 * 60 * 1000)) * HOUR_HEIGHT,
    );
    result.push({ ...item.event, col: item.col, cols, top, height });
  }
  return result;
}

export function minutesFromClick(offsetY: number): number {
  const minutes = Math.round((offsetY / HOUR_HEIGHT) * 60 / 15) * 15;
  return Math.max(0, Math.min(24 * 60 - 15, minutes));
}

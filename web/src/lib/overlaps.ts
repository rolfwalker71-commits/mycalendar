import type { DateTime } from "luxon";
import { fromISO } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

export type EventOverlap = {
  a: CalendarEvent;
  b: CalendarEvent;
  startLabel: string;
  endLabel: string;
};

/** Timed (non-all-day) overlaps for a single calendar day. */
export function dayOverlaps(events: CalendarEvent[], day: DateTime): EventOverlap[] {
  const timed = events
    .filter((e) => !e.allDay)
    .map((e) => {
      const start = fromISO(e.startAt);
      const end = fromISO(e.endAt);
      if (!start || !end) return null;
      const dayStart = day.startOf("day");
      const dayEnd = day.endOf("day");
      const s = start < dayStart ? dayStart : start;
      const en = end > dayEnd ? dayEnd : end;
      if (en <= s) return null;
      return { event: e, start: s, end: en };
    })
    .filter((x): x is { event: CalendarEvent; start: DateTime; end: DateTime } => Boolean(x))
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const out: EventOverlap[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (b.start >= a.end) break;
      if (b.start < a.end && a.start < b.end) {
        const overlapStart = a.start > b.start ? a.start : b.start;
        const overlapEnd = a.end < b.end ? a.end : b.end;
        out.push({
          a: a.event,
          b: b.event,
          startLabel: overlapStart.toFormat("HH:mm"),
          endLabel: overlapEnd.toFormat("HH:mm"),
        });
      }
    }
  }
  return out;
}

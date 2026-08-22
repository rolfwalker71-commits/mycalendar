import { DateTime } from "luxon";
import { formatTime, fromISO, isSameDay, now, toIsoDate, ZONE } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";
import { EventCardBody } from "@/components/EventCardBody";
import { SwipeableEventCard } from "@/components/SwipeableEventCard";
import { LineWeather } from "@/components/WeatherMark";

function eventDayKey(e: CalendarEvent): string | null {
  if (e.allDay) return toIsoDate(e.allDayStart) ?? toIsoDate(e.startAt);
  return fromISO(e.startAt)?.toISODate() ?? null;
}

function sortDayEvents(items: CalendarEvent[]): CalendarEvent[] {
  return [...items].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const aStart = a.allDay ? toIsoDate(a.allDayStart) ?? "" : a.startAt ?? "";
    const bStart = b.allDay ? toIsoDate(b.allDayStart) ?? "" : b.startAt ?? "";
    return aStart.localeCompare(bStart);
  });
}

function groupByDay(events: CalendarEvent[], from: DateTime) {
  const map = new Map<string, CalendarEvent[]>();
  const fromDay = from.setZone(ZONE).startOf("day");
  for (const e of events) {
    const key = eventDayKey(e);
    if (!key) continue;
    const day = DateTime.fromISO(key, { zone: ZONE });
    if (!day.isValid || day < fromDay) continue;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, items]) => [iso, sortDayEvents(items)] as const);
}

export function AgendaView({
  events,
  from,
  onOpen,
  onDelete,
  onDuplicate,
  onMove,
}: {
  events: CalendarEvent[];
  from: DateTime;
  onOpen: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
  onDuplicate: (e: CalendarEvent) => void;
  onMove: (e: CalendarEvent) => void;
}) {
  const groups = groupByDay(events, from);
  const today = now();

  if (!groups.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-lg font-medium">Keine Termine</p>
        <p className="mt-1 text-sm text-muted-foreground">
          In den nächsten Wochen ist nichts geplant.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-28 lg:pb-6">
      {groups.map(([iso, items]) => {
        const day = DateTime.fromISO(iso, { zone: ZONE }).setLocale("de");
        return (
          <section key={iso}>
            <h2 className="flex items-baseline justify-between gap-3 px-3 pb-2 text-[0.75rem]">
              <span className="min-w-0 break-words leading-snug">
                {isSameDay(day, today) ? (
                  <span className="font-bold">Heute</span>
                ) : (
                  <>
                    <span className="font-bold capitalize">{day.toFormat("cccc")}</span>
                    <span className="font-medium text-muted-foreground">
                      , {day.toFormat("d. LLLL yyyy")}
                    </span>
                  </>
                )}
              </span>
              <LineWeather iso={iso} />
            </h2>
            <ul className="flex flex-col gap-2 px-3 py-2">
              {items.map((event) => {
                const start = fromISO(event.startAt);
                const subtitle = `${event.allDay ? "Ganztägig" : start ? formatTime(start) : ""}${
                  event.calendarSummary ? ` · ${event.calendarSummary}` : ""
                }`;
                return (
                  <li key={event.id}>
                    <SwipeableEventCard
                      onOpen={() => onOpen(event)}
                      onEdit={() => onOpen(event)}
                      onDelete={() => onDelete(event)}
                      onDuplicate={() => onDuplicate(event)}
                      onMove={() => onMove(event)}
                      className="shadow-lg shadow-black/10 ring-1 ring-border"
                    >
                      <EventCardBody event={event} subtitle={subtitle} />
                    </SwipeableEventCard>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

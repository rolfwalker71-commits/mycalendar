import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import { eventChipStyle } from "@/lib/colors";
import { formatTime, fromISO, isSameDay, now, ZONE } from "@/lib/dates";
import { HOUR_HEIGHT, minutesFromClick, packDayEvents } from "@/lib/layout";
import type { CalendarEvent } from "@/lib/types";
import { EventChip, isDeclined } from "@/components/EventChip";
import { Button } from "@/components/ui/button";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimeGrid({
  day,
  events,
  onOpen,
  onCreate,
  showNow,
}: {
  day: DateTime;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onCreate: (start: DateTime) => void;
  showNow?: boolean;
}) {
  const allDay = events.filter((e) => e.allDay);
  const laid = packDayEvents(events, day);
  const today = now();
  const showLine = Boolean(showNow && isSameDay(day, today));
  const nowTop = ((today.hour * 60 + today.minute) / 60) * HOUR_HEIGHT;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {allDay.length ? (
        <div className="flex flex-col gap-1 border-b border-border px-2 py-2">
          {allDay.map((e) => (
            <EventChip key={e.id} event={e} onClick={() => onOpen(e)} />
          ))}
        </div>
      ) : (
        <div className="h-2 border-b border-border" />
      )}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ height: 24 * HOUR_HEIGHT }}
          onClick={(ev) => {
            const rect = ev.currentTarget.getBoundingClientRect();
            const y = ev.clientY - rect.top + ev.currentTarget.scrollTop;
            const mins = minutesFromClick(y);
            const start = day.startOf("day").set({ hour: Math.floor(mins / 60), minute: mins % 60 });
            onCreate(start);
          }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-0 left-12 border-t border-border/80"
              style={{ top: h * HOUR_HEIGHT }}
            >
              <span className="absolute -top-2.5 -left-12 w-11 text-right text-[11px] tabular-nums text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {laid.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onOpen(e);
              }}
              className={cn(
                "absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs leading-tight",
                isDeclined(e) && "opacity-50 line-through",
              )}
              style={{
                ...eventChipStyle(e.backgroundColor),
                top: e.top,
                height: e.height,
                left: `calc(3.25rem + ${(e.col / e.cols) * 100}% * 0.92)`,
                width: `calc((100% - 3.25rem) / ${e.cols} - 4px)`,
              }}
            >
              <span className="block truncate font-medium">{e.summary || "Ohne Titel"}</span>
              <span className="block truncate opacity-90">
                {fromISO(e.startAt) ? formatTime(fromISO(e.startAt)!) : ""}
              </span>
            </button>
          ))}
          {showLine ? (
            <div
              className="pointer-events-none absolute right-0 left-12 z-10 h-0.5 bg-today"
              style={{ top: nowTop }}
            >
              <span className="absolute -top-1.5 -left-2 size-3 rounded-full bg-today" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DayView({
  day,
  events,
  onOpen,
  onCreate,
  agendaBeside,
}: {
  day: DateTime;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onCreate: (start: DateTime) => void;
  agendaBeside?: boolean;
}) {
  const tzBanner = events.find(
    (e) => e.timezone && e.timezone !== ZONE && e.timezone !== e.calendarTimezone,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tzBanner ? (
          <p className="px-3 py-1 text-xs text-muted-foreground">
            Manche Termine in {tzBanner.timezone}
          </p>
        ) : null}
        <TimeGrid day={day} events={events} onOpen={onOpen} onCreate={onCreate} showNow />
      </div>
      {agendaBeside ? (
        <aside className="hidden w-72 shrink-0 overflow-auto border-l border-border p-3 lg:block">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">An diesem Tag</h2>
          {events.length ? (
            events.map((e) => (
              <Button
                key={e.id}
                variant="ghost"
                className="mb-1 h-auto min-h-11 w-full justify-start whitespace-normal text-left leading-snug"
                onClick={() => onOpen(e)}
              >
                {e.summary || "Ohne Titel"}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Keine Termine</p>
          )}
        </aside>
      ) : null}
    </div>
  );
}

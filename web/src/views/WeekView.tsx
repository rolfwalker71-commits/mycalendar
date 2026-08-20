import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import { isSameDay, now, startOfWeek, weekdayShort } from "@/lib/dates";
import { eventOverlapsDay } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";
import { TimeGrid } from "@/views/DayView";
import { DayWeather } from "@/components/WeatherMark";

export function WeekView({
  cursor,
  weekStart,
  events,
  onOpen,
  onCreate,
  compact,
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onCreate: (start: DateTime) => void;
  compact?: boolean;
}) {
  const start = startOfWeek(cursor, weekStart);
  const days = Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));
  const labels = weekdayShort(weekStart);
  const today = now();

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex gap-2 overflow-x-auto px-2 pb-2">
          {days.map((day, i) => (
            <div
              key={day.toISODate()}
              className="min-w-[12rem] shrink-0 rounded-2xl bg-card p-2 ring-1 ring-border"
            >
              <div className="mb-2 flex items-center justify-between gap-1 px-1">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="text-xs text-muted-foreground">{labels[i]}</span>
                  <DayWeather iso={day.toISODate()} />
                </span>
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm",
                    isSameDay(day, today) && "bg-today text-today-foreground",
                  )}
                >
                  {day.day}
                </span>
              </div>
              <div className="max-h-[50dvh] overflow-auto">
                <TimeGrid
                  day={day}
                  events={events.filter((e) => eventOverlapsDay(e, day))}
                  onOpen={onOpen}
                  onCreate={onCreate}
                  showNow={isSameDay(day, today)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border">
        <div />
        {days.map((day, i) => (
          <div key={day.toISODate()} className="py-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <span>{labels[i]}</span>
              <DayWeather iso={day.toISODate()} />
            </div>
            <div
              className={cn(
                "mx-auto mt-1 inline-flex size-8 items-center justify-center rounded-full text-lg font-medium",
                isSameDay(day, today) && "bg-today text-today-foreground",
              )}
            >
              {day.day}
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 overflow-hidden">
        {days.map((day) => (
          <div key={day.toISODate()} className="min-w-0 border-l border-border first:border-l-0">
            <TimeGrid
              day={day}
              events={events.filter((e) => eventOverlapsDay(e, day))}
              onOpen={onOpen}
              onCreate={onCreate}
              showNow={isSameDay(day, today)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

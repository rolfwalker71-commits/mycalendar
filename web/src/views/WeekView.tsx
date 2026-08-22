import { useRef } from "react";
import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import { isSameDay, now, startOfWeek, weekdayShort } from "@/lib/dates";
import { eventOverlapsDay } from "@/lib/dates";
import type { CalendarEvent, TaskItem, WorkingHours } from "@/lib/types";
import { TimeGrid } from "@/views/DayView";
import { DayWeather } from "@/components/WeatherMark";

export function WeekView({
  cursor,
  weekStart,
  events,
  onOpen,
  onCreate,
  onMove,
  compact,
  secondTimezone,
  workingHours,
  tasks,
  onToggleTask,
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onCreate: (start: DateTime) => void;
  onMove?: (event: CalendarEvent, start: DateTime, end: DateTime) => void;
  compact?: boolean;
  secondTimezone?: string | null;
  workingHours?: WorkingHours | null;
  tasks?: TaskItem[];
  onToggleTask?: (task: TaskItem) => void;
}) {
  const start = startOfWeek(cursor, weekStart);
  const days = Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));
  const labels = weekdayShort(weekStart);
  const today = now();
  const scrollEls = useRef<(HTMLDivElement | null)[]>([]);
  const syncing = useRef(false);

  function setScrollEl(index: number, el: HTMLDivElement | null) {
    scrollEls.current[index] = el;
  }

  function syncScroll(source: HTMLDivElement) {
    if (syncing.current) return;
    syncing.current = true;
    const top = source.scrollTop;
    for (const el of scrollEls.current) {
      if (el && el !== source && el.scrollTop !== top) el.scrollTop = top;
    }
    syncing.current = false;
  }

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex gap-2 overflow-x-auto px-2 pb-2">
          {days.map((day, i) => (
            <div
              key={day.toISODate()}
              className="flex min-h-0 min-w-[12rem] shrink-0 flex-col rounded-2xl bg-card p-2 ring-1 ring-border"
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
              <div className="flex max-h-[50dvh] min-h-0 flex-col overflow-hidden">
                <TimeGrid
                  day={day}
                  events={events.filter((e) => eventOverlapsDay(e, day))}
                  onOpen={onOpen}
                  onCreate={onCreate}
                  onMove={onMove}
                  showNow={isSameDay(day, today)}
                  secondTimezone={secondTimezone}
                  workingHours={workingHours}
                  tasks={tasks}
                  onToggleTask={onToggleTask}
                  scrollRef={(el) => setScrollEl(i, el)}
                  onScroll={(e) => syncScroll(e.currentTarget)}
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
      <div className="grid shrink-0 grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border">
        <div />
        {days.map((day, i) => (
          <div key={day.toISODate()} className="py-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs">
              <span className="text-muted-foreground">{labels[i]}</span>
              <DayWeather iso={day.toISODate()} />
            </div>
            <div
              className={cn(
                "mx-auto mt-1 inline-flex size-8 items-center justify-center rounded-full text-base font-medium",
                isSameDay(day, today) && "bg-today text-today-foreground",
              )}
            >
              {day.day}
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 overflow-hidden">
        {days.map((day, i) => (
          <div
            key={day.toISODate()}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border first:border-l-0"
          >
            <TimeGrid
              day={day}
              events={events.filter((e) => eventOverlapsDay(e, day))}
              onOpen={onOpen}
              onCreate={onCreate}
              onMove={onMove}
              showNow={isSameDay(day, today)}
              secondTimezone={secondTimezone}
              workingHours={workingHours}
              tasks={tasks}
              onToggleTask={onToggleTask}
              scrollRef={(el) => setScrollEl(i, el)}
              onScroll={(e) => syncScroll(e.currentTarget)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

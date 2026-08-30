import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import { eventOverlapsDay, isSameDay, now, startOfWeek, weekdayLabels } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";
import { EventChip } from "@/components/EventChip";
import { Button } from "@/components/ui/button";
import { DayWeather } from "@/components/WeatherMark";

export function MonthView({
  cursor,
  weekStart,
  events,
  onSelectDay,
  onOpen,
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  events: CalendarEvent[];
  onSelectDay: (day: DateTime) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  const start = startOfWeek(cursor.startOf("month"), weekStart);
  const end = startOfWeek(cursor.endOf("month"), weekStart).plus({ days: 6 });
  const days: DateTime[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) days.push(d);
  const weeks: DateTime[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const today = now();
  const labels = weekdayLabels(weekStart);
  const maxChips = 3;
  const gridCols = "grid-cols-[2rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("grid border-b border-border text-center text-xs text-muted-foreground", gridCols)}>
        <div className="flex items-center justify-center py-2 text-[0.625rem] font-medium tracking-wide">
          KW
        </div>
        {labels.map((l) => (
          <div key={l} className="py-2">
            {l}
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {weeks.map((week) => {
          const kw = week[0]?.weekNumber ?? 0;
          return (
            <div
              key={week[0]?.toISODate() ?? kw}
              className={cn("grid min-h-0 flex-1", gridCols)}
            >
              <div
                className="flex items-start justify-center border-b border-r border-border pt-2 text-[0.625rem] font-medium text-muted-foreground"
                aria-label={`Kalenderwoche ${kw}`}
              >
                {kw}
              </div>
              {week.map((day) => {
                const dayEvents = events.filter((e) => eventOverlapsDay(e, day));
                const extra = dayEvents.length - maxChips;
                const inMonth = day.month === cursor.month;
                return (
                  <div
                    key={day.toISODate()}
                    className={cn(
                      "flex min-h-0 flex-col border-b border-r border-border p-1",
                      !inMonth && "bg-muted/30",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "size-8 shrink-0 rounded-full text-sm",
                          isSameDay(day, today) && "bg-today text-today-foreground hover:bg-today/90",
                        )}
                        onClick={() => onSelectDay(day)}
                      >
                        {day.day}
                      </Button>
                      <DayWeather iso={day.toISODate()} />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, maxChips).map((e) => (
                        <EventChip key={e.id} event={e} compact onClick={() => onOpen(e)} />
                      ))}
                      {extra > 0 ? (
                        <Button
                          variant="ghost"
                          className="h-auto min-h-0 justify-start px-1 py-0 text-xs text-muted-foreground"
                          onClick={() => onSelectDay(day)}
                        >
                          +{extra} weitere
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

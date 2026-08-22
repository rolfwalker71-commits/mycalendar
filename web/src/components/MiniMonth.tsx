import { DateTime } from "luxon";
import { CalendarDays, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isSameDay, now, startOfWeek, weekdayLabels } from "@/lib/dates";

export type MiniRange = "week" | "month";

export function MiniMonth({
  cursor,
  weekStart,
  onSelect,
  eventsByDay,
  range = "month",
  compact = false,
  staticDays = false,
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  onSelect: (day: DateTime) => void;
  eventsByDay?: Set<string>;
  range?: MiniRange;
  compact?: boolean;
  staticDays?: boolean;
}) {
  const start =
    range === "week"
      ? startOfWeek(cursor, weekStart)
      : startOfWeek(cursor.startOf("month"), weekStart);
  const end =
    range === "week"
      ? start.plus({ days: 6 })
      : startOfWeek(cursor.endOf("month"), weekStart).plus({ days: 6 });
  const days: DateTime[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    days.push(d);
  }
  const today = now();
  const labels = weekdayLabels(weekStart);

  return (
    <div className="px-1">
      <div className="grid grid-cols-7 justify-items-center gap-y-1">
        {labels.map((l, i) => (
          <div
            key={`${l}-${i}`}
            className="flex h-6 w-full items-center justify-center text-[0.6875rem] font-medium tracking-wide text-muted-foreground"
          >
            {l}
          </div>
        ))}
        {days.map((day) => {
          const inMonth = range === "week" || day.month === cursor.month;
          const selected = isSameDay(day, cursor);
          const isToday = isSameDay(day, today);
          const iso = day.toISODate() ?? "";
          const has = eventsByDay?.has(iso);
          const dayClass = cn(
            "flex items-center justify-center rounded-full text-sm font-normal",
            compact ? "size-9" : "size-11",
            !inMonth && "text-muted-foreground/50",
            selected && !isToday && "bg-muted text-foreground",
            isToday && "bg-today text-today-foreground",
          );
          const label = (
            <span className="relative">
              {day.day}
              {has ? (
                <span className="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
              ) : null}
            </span>
          );
          if (staticDays) {
            return (
              <span key={iso} className={dayClass} aria-current={isToday ? "date" : undefined}>
                {label}
              </span>
            );
          }
          return (
            <Button
              key={iso}
              variant="ghost"
              size="icon"
              onClick={() => onSelect(day)}
              className={cn(dayClass, "p-0", isToday && "hover:bg-today/90")}
              aria-label={day.setLocale("de").toFormat("d. LLLL")}
              aria-current={isToday ? "date" : undefined}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function MiniNavigator({
  cursor,
  weekStart,
  range,
  onRangeChange,
  onSelect,
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  range: MiniRange;
  onRangeChange: (range: MiniRange) => void;
  onSelect: (day: DateTime) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={range} onValueChange={(v) => onRangeChange(v as MiniRange)}>
        <TabsList className="w-full">
          <TabsTrigger value="week">
            <CalendarRange />
            Woche
          </TabsTrigger>
          <TabsTrigger value="month">
            <CalendarDays />
            Monat
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <MiniMonth
        cursor={cursor}
        weekStart={weekStart}
        range={range}
        onSelect={onSelect}
      />
    </div>
  );
}

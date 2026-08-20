import { DateTime } from "luxon";
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
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  onSelect: (day: DateTime) => void;
  eventsByDay?: Set<string>;
  range?: MiniRange;
  compact?: boolean;
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
      <div className="mb-2 grid grid-cols-7 gap-0 text-center text-[11px] font-medium text-muted-foreground">
        {labels.map((l, i) => (
          <div key={`${l}-${i}`}>{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day) => {
          const inMonth = range === "week" || day.month === cursor.month;
          const selected = isSameDay(day, cursor);
          const isToday = isSameDay(day, today);
          const iso = day.toISODate() ?? "";
          const has = eventsByDay?.has(iso);
          return (
            <Button
              key={iso}
              variant="ghost"
              size="icon"
              onClick={() => onSelect(day)}
              className={cn(
                "justify-center rounded-full p-0 text-sm font-normal",
                compact ? "size-9" : "size-11",
                !inMonth && "text-muted-foreground/50",
                selected && !isToday && "bg-muted text-foreground",
                isToday && "bg-today text-today-foreground hover:bg-today/90",
              )}
              aria-label={day.setLocale("de").toFormat("d. LLLL")}
              aria-current={isToday ? "date" : undefined}
            >
              <span className="relative">
                {day.day}
                {has ? (
                  <span className="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
                ) : null}
              </span>
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
        <TabsList className="h-14 min-h-14 w-full rounded-full bg-muted p-1.5 group-data-horizontal/tabs:h-14">
          <TabsTrigger
            value="week"
            className="h-full min-h-0 max-h-full items-center rounded-full px-3 py-0 leading-none data-active:bg-background data-active:shadow-sm"
          >
            Woche
          </TabsTrigger>
          <TabsTrigger
            value="month"
            className="h-full min-h-0 max-h-full items-center rounded-full px-3 py-0 leading-none data-active:bg-background data-active:shadow-sm"
          >
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

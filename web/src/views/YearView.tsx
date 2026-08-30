import { DateTime } from "luxon";
import { MiniMonth } from "@/components/MiniMonth";
import { useChrome } from "@/components/ChromeProvider";
import { listTileClass } from "@/lib/platform";
import { monthTitle } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function YearView({
  cursor,
  weekStart,
  onSelectMonth,
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  onSelectMonth: (month: DateTime) => void;
}) {
  const { chrome } = useChrome();
  const months = Array.from({ length: 12 }, (_, i) => cursor.startOf("year").plus({ months: i }));
  return (
    <div className="grid grid-cols-1 gap-4 overflow-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
      {months.map((m) => (
        <button
          key={m.month}
          type="button"
          onClick={() => onSelectMonth(m)}
          className={cn("w-full bg-card p-3 text-left hover:bg-muted", listTileClass(chrome))}
          aria-label={monthTitle(m)}
        >
          <h2 className="mb-2 px-1 text-sm font-medium capitalize">{monthTitle(m)}</h2>
          <MiniMonth
            compact
            staticDays
            cursor={m}
            weekStart={weekStart}
            onSelect={onSelectMonth}
          />
        </button>
      ))}
    </div>
  );
}

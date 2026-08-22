import { DateTime } from "luxon";
import { MiniMonth } from "@/components/MiniMonth";
import { monthTitle } from "@/lib/dates";

export function YearView({
  cursor,
  weekStart,
  onSelectMonth,
}: {
  cursor: DateTime;
  weekStart: 0 | 1;
  onSelectMonth: (month: DateTime) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => cursor.startOf("year").plus({ months: i }));
  return (
    <div className="grid grid-cols-1 gap-4 overflow-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
      {months.map((m) => (
        <button
          key={m.month}
          type="button"
          onClick={() => onSelectMonth(m)}
          className="w-full rounded-2xl bg-card p-3 text-left shadow-lg shadow-black/10 ring-1 ring-border hover:bg-muted"
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

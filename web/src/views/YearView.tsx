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
    <div className="grid grid-cols-1 gap-8 overflow-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
      {months.map((m) => (
        <section key={m.month}>
          <h2 className="mb-2 px-1 text-sm font-medium capitalize">{monthTitle(m)}</h2>
          <MiniMonth compact cursor={m} weekStart={weekStart} onSelect={onSelectMonth} />
        </section>
      ))}
    </div>
  );
}

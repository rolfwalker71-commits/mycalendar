import { AlertTriangle } from "lucide-react";
import type { DateTime } from "luxon";
import type { CalendarEvent } from "@/lib/types";
import { dayOverlaps } from "@/lib/overlaps";
import { cn } from "@/lib/utils";

export function DayOverlapBanner({
  day,
  events,
  onOpen,
  className,
}: {
  day: DateTime;
  events: CalendarEvent[];
  onOpen?: (e: CalendarEvent) => void;
  className?: string;
}) {
  const overlaps = dayOverlaps(events, day);
  if (!overlaps.length) return null;
  return (
    <div
      className={cn(
        "mx-3 mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100",
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {overlaps.length === 1
              ? "1 Überschneidung heute"
              : `${overlaps.length} Überschneidungen heute`}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-amber-900/80 dark:text-amber-100/80">
            {overlaps.slice(0, 4).map((o) => (
              <li key={`${o.a.id}-${o.b.id}`}>
                <button
                  type="button"
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => onOpen?.(o.a)}
                >
                  {o.startLabel}–{o.endLabel}: {o.a.summary || "Ohne Titel"} · {o.b.summary || "Ohne Titel"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api";
import { formatDate, formatIsoDate, formatTime, fromISO } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";
import { toast } from "sonner";
import { EventCardBody } from "@/components/EventCardBody";
import { SwipeableEventCard } from "@/components/SwipeableEventCard";

export function SearchView({
  onOpen,
  onDelete,
  onDuplicate,
  onMove,
}: {
  onOpen: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
  onDuplicate: (e: CalendarEvent) => void;
  onMove: (e: CalendarEvent) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const query = q.trim();
      if (!query) {
        setResults([]);
        return;
      }
      setLoading(true);
      apiClient
        .search(query)
        .then((res) => setResults(res.events))
        .catch((err) => {
          toast.error(err instanceof ApiError ? err.message : "Suche fehlgeschlagen.");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="calendar-search"
            value={q}
            onValueChange={setQ}
            placeholder="Termine durchsuchen"
            className="pl-9"
            autoFocus
          />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3 py-4 pb-44">
        {loading ? (
          <p className="text-sm text-muted-foreground">Suche…</p>
        ) : null}
        {!loading && q && !results.length ? (
          <p className="text-sm text-muted-foreground">Keine Treffer.</p>
        ) : null}
        {results.map((event) => {
          const start = fromISO(event.startAt);
          return (
            <SwipeableEventCard
              key={event.id}
              onOpen={() => onOpen(event)}
              onDelete={() => onDelete(event)}
              onDuplicate={() => onDuplicate(event)}
              onMove={() => onMove(event)}
              className="shadow-lg shadow-black/10 ring-1 ring-border"
            >
              <EventCardBody
                event={event}
                subtitle={
                  event.allDay
                    ? formatIsoDate(event.allDayStart)
                    : start
                      ? `${formatDate(start)} · ${formatTime(start)}`
                      : ""
                }
              />
            </SwipeableEventCard>
          );
        })}
      </div>
    </div>
  );
}

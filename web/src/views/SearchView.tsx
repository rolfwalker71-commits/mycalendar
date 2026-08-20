import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient, ApiError } from "@/lib/api";
import { formatDate, formatIsoDate, formatTime, fromISO } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";
import { eventChipStyle } from "@/lib/colors";
import { toast } from "sonner";

export function SearchView({
  onOpen,
}: {
  onOpen: (e: CalendarEvent) => void;
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
      <div className="flex flex-col gap-2 px-3 py-4 pb-28">
        {loading ? (
          <p className="text-sm text-muted-foreground">Suche…</p>
        ) : null}
        {!loading && q && !results.length ? (
          <p className="text-sm text-muted-foreground">Keine Treffer.</p>
        ) : null}
        {results.map((event) => {
          const start = fromISO(event.startAt);
          return (
            <Button
              key={event.id}
              variant="ghost"
              onClick={() => onOpen(event)}
              className="h-auto min-h-0 w-full flex-col items-stretch whitespace-normal rounded-2xl bg-card px-4 py-3 text-left leading-snug shadow-lg shadow-black/10 ring-1 ring-border hover:bg-muted"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: eventChipStyle(event.backgroundColor).backgroundColor }}
                />
                <div>
                  <p className="font-medium break-words">{event.summary || "Ohne Titel"}</p>
                  <p className="text-sm text-muted-foreground">
                    {event.allDay
                      ? formatIsoDate(event.allDayStart)
                      : start
                        ? `${formatDate(start)} · ${formatTime(start)}`
                        : ""}
                  </p>
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

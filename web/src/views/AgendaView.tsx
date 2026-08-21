import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { MapPin, Video } from "lucide-react";
import { eventChipStyle } from "@/lib/colors";
import { formatTime, fromISO, isSameDay, now } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";
import { isDeclined } from "@/components/EventChip";
import { GeminiCard } from "@/components/AiSummary";
import { EventMapSnippet } from "@/components/EventMap";
import { EventArtBanner } from "@/components/EventArt";
import { SwipeableEventCard } from "@/components/SwipeableEventCard";
import { LineWeather } from "@/components/WeatherMark";
import { apiClient, ApiError } from "@/lib/api";

function groupByDay(events: CalendarEvent[], from: DateTime) {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.allDay
      ? e.allDayStart
      : fromISO(e.startAt)?.toISODate() ?? null;
    if (!key) continue;
    if (DateTime.fromISO(key) < from.startOf("day")) continue;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function AgendaView({
  events,
  from,
  onOpen,
  onDelete,
  onDuplicate,
  onMove,
  geminiAvailable,
  tasks,
}: {
  events: CalendarEvent[];
  from: DateTime;
  onOpen: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
  onDuplicate: (e: CalendarEvent) => void;
  onMove: (e: CalendarEvent) => void;
  geminiAvailable?: boolean;
  tasks?: import("@/lib/types").TaskItem[];
}) {
  const groups = groupByDay(events, from);
  const today = now();
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const dayFrom = from.startOf("day");
  const dayTo = from.endOf("day");
  const dayKey = dayFrom.toISODate();

  useEffect(() => {
    setBriefing(null);
  }, [dayKey]);

  async function loadBriefing() {
    setBriefingLoading(true);
    try {
      const res = await apiClient.aiCalendarBriefing(
        dayFrom.toUTC().toISO() ?? "",
        dayTo.toUTC().toISO() ?? "",
      );
      setBriefing(res.text);
    } catch (err) {
      setBriefing(err instanceof ApiError ? err.message : "Überblick fehlgeschlagen.");
    } finally {
      setBriefingLoading(false);
    }
  }

  if (!groups.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-lg font-medium">Keine Termine</p>
        <p className="mt-1 text-sm text-muted-foreground">
          In den nächsten Wochen ist nichts geplant.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-28 lg:pb-6">
      <GeminiCard
        className="mx-3 mt-3"
        title="Überblick"
        text={briefing}
        loading={briefingLoading}
        available={geminiAvailable}
        onGenerate={() => void loadBriefing()}
      />
      {tasks?.length ? (
        <section>
          <h2 className="px-3 pb-2 text-sm font-medium text-muted-foreground">Aufgaben</h2>
          <ul className="flex flex-col gap-1 px-3">
            {tasks
              .filter((t) => t.status !== "completed")
              .slice(0, 12)
              .map((t) => (
                <li key={t.id} className="rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-border">
                  {t.title}
                  {t.due ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {DateTime.fromISO(t.due, { setZone: true }).toFormat("d. LLL")}
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      {groups.map(([iso, items]) => {
        const day = DateTime.fromISO(iso).setLocale("de");
        return (
          <section key={iso}>
            <h2 className="flex items-baseline justify-between gap-3 px-3 pb-2 text-sm">
              <span className="min-w-0 truncate">
                {isSameDay(day, today) ? (
                  <span className="font-bold">Heute</span>
                ) : (
                  <>
                    <span className="font-bold capitalize">{day.toFormat("cccc")}</span>
                    <span className="font-medium text-muted-foreground">
                      , {day.toFormat("d. LLLL yyyy")}
                    </span>
                  </>
                )}
              </span>
              <LineWeather iso={iso} />
            </h2>
            <ul className="flex flex-col gap-2 px-3 py-2">
              {items.map((event) => {
                const start = fromISO(event.startAt);
                const declined = isDeclined(event);
                return (
                  <li key={event.id}>
                    <SwipeableEventCard
                      onOpen={() => onOpen(event)}
                      onDelete={() => onDelete(event)}
                      onDuplicate={() => onDuplicate(event)}
                      onMove={() => onMove(event)}
                      className="shadow-lg shadow-black/10 ring-1 ring-border"
                    >
                      <div className="flex min-h-0 w-full flex-row items-stretch overflow-hidden bg-card text-left leading-snug">
                        <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
                          <span
                            className="mt-1 size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: eventChipStyle(event.backgroundColor).backgroundColor }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium break-words ${declined ? "text-muted-foreground line-through" : ""}`}>
                              {event.summary || "Ohne Titel"}
                            </p>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {event.allDay ? "Ganztägig" : start ? formatTime(start) : ""}
                              {event.calendarSummary ? ` · ${event.calendarSummary}` : ""}
                            </p>
                            {event.location ? (
                              <>
                                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                  <MapPin className="size-3.5" />
                                  <span className="break-words">{event.location}</span>
                                </p>
                                <EventMapSnippet location={event.location} />
                              </>
                            ) : null}
                            {event.hangoutLink ? (
                              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                <Video className="size-3.5" />
                                Meet
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <EventArtBanner
                          summary={event.summary}
                          description={event.description}
                          calendarSummary={event.calendarSummary}
                          eventType={event.eventType}
                        />
                      </div>
                    </SwipeableEventCard>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

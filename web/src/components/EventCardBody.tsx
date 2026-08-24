import { MapPin, Plane, Video } from "lucide-react";
import { eventChipStyle } from "@/lib/colors";
import { parseFlightRoute } from "@/lib/flights";
import type { CalendarEvent } from "@/lib/types";
import { isDeclined } from "@/components/EventChip";
import { EventArtBanner } from "@/components/EventArt";
import { EventSourceMark } from "@/components/EventSourceMark";
import { cn } from "@/lib/utils";

function FlightPathLabel({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm">
      <span className="font-semibold tabular-nums tracking-wide">{from}</span>
      <span className="relative h-px min-w-10 flex-1 max-w-16 bg-border">
        <Plane className="absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 text-sky-600" />
      </span>
      <span className="font-semibold tabular-nums tracking-wide">{to}</span>
    </span>
  );
}

export function isMsEvent(event: CalendarEvent): boolean {
  return event.source === "microsoft";
}

export function EventCardBody({
  event,
  subtitle,
}: {
  event: CalendarEvent;
  subtitle: string;
}) {
  const declined = isDeclined(event);
  const route = parseFlightRoute(event.location, event.summary);
  const ms = isMsEvent(event);
  const art = (
    <EventArtBanner
      summary={event.summary}
      description={event.description}
      calendarSummary={event.calendarSummary}
      eventType={event.eventType}
      eventId={event.id}
      attachments={event.attachments}
      coverUrl={event.coverUrl}
      source={event.source}
    />
  );

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-row items-stretch overflow-hidden text-left leading-snug",
        ms ? "bg-sky-50 dark:bg-sky-950/40" : "bg-card",
      )}
    >
      {ms ? art : null}
      <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
        <span
          className={cn(
            "mt-1 size-2.5 shrink-0 rounded-full",
            ms && "ring-2 ring-sky-400/50",
          )}
          style={{ backgroundColor: eventChipStyle(event.backgroundColor).backgroundColor }}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium break-words", declined && "text-muted-foreground line-through")}>
            {event.summary || "Ohne Titel"}
            <EventSourceMark source={event.source} size="sm" />
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          {event.location ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              {route ? <Plane className="size-3.5 shrink-0" /> : <MapPin className="size-3.5 shrink-0" />}
              {route ? (
                <FlightPathLabel from={route.from} to={route.to} />
              ) : (
                <span className="break-words">{event.location}</span>
              )}
            </p>
          ) : null}
          {event.hangoutLink ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Video className="size-3.5" />
              Meet
            </p>
          ) : null}
        </div>
      </div>
      {!ms ? art : null}
    </div>
  );
}

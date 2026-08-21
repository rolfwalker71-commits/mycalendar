import { MapPin, Plane, Video } from "lucide-react";
import { eventChipStyle } from "@/lib/colors";
import { parseFlightRoute } from "@/lib/flights";
import type { CalendarEvent } from "@/lib/types";
import { isDeclined } from "@/components/EventChip";
import { EventArtBanner } from "@/components/EventArt";
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

export function EventCardBody({
  event,
  subtitle,
}: {
  event: CalendarEvent;
  subtitle: string;
}) {
  const declined = isDeclined(event);
  const route = parseFlightRoute(event.location, event.summary);

  return (
    <div className="flex min-h-0 w-full flex-row items-stretch overflow-hidden bg-card text-left leading-snug">
      <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: eventChipStyle(event.backgroundColor).backgroundColor }}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium break-words", declined && "text-muted-foreground line-through")}>
            {event.summary || "Ohne Titel"}
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
      <EventArtBanner
        summary={event.summary}
        description={event.description}
        calendarSummary={event.calendarSummary}
        eventType={event.eventType}
        coverUrl={event.coverUrl}
      />
    </div>
  );
}

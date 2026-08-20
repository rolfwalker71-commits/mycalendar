import { MapPin, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventChipStyle } from "@/lib/colors";
import { formatTime, fromISO } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

export function isDeclined(event: CalendarEvent): boolean {
  return Boolean(event.attendees?.some((a) => a.self && a.responseStatus === "declined"));
}

export function EventChip({
  event,
  compact,
  className,
  onClick,
}: {
  event: CalendarEvent;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const declined = isDeclined(event);
  const start = fromISO(event.startAt);
  const time = event.allDay ? "Ganztägig" : start ? formatTime(start) : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-h-0 items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-xs leading-tight",
        compact ? "h-5 py-0" : "min-h-6 py-0.5",
        declined && "opacity-50 line-through",
        className,
      )}
      style={eventChipStyle(event.backgroundColor)}
      title={event.summary ?? "Ohne Titel"}
    >
      <span className="min-w-0 flex-1 truncate font-medium">
        {event.summary || "Ohne Titel"}
      </span>
      {!compact && event.location ? <MapPin className="size-3 shrink-0" /> : null}
      {!compact && event.hangoutLink ? <Video className="size-3 shrink-0" /> : null}
      {!compact && !event.allDay ? (
        <span className="shrink-0 opacity-90">{time}</span>
      ) : null}
    </button>
  );
}

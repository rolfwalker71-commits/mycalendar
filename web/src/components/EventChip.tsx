import { useRef } from "react";
import { MapPin, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventChipStyle } from "@/lib/colors";
import { formatTime, fromISO } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

const LONG_PRESS_MS = 480;

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
  onClick?: () => void;
  className?: string;
}) {
  const declined = isDeclined(event);
  const start = fromISO(event.startAt);
  const time = event.allDay ? "Ganztägig" : start ? formatTime(start) : "";
  const holdTimer = useRef(0);
  const held = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const pointerType = useRef("");

  function clearHold() {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (!onClick || e.button !== 0) return;
        pointerType.current = e.pointerType;
        held.current = false;
        startX.current = e.clientX;
        startY.current = e.clientY;
        clearHold();
        if (e.pointerType !== "mouse") {
          holdTimer.current = window.setTimeout(() => {
            held.current = true;
            onClick();
          }, LONG_PRESS_MS);
        }
      }}
      onPointerMove={(e) => {
        if (!holdTimer.current) return;
        if (Math.abs(e.clientX - startX.current) > 8 || Math.abs(e.clientY - startY.current) > 8) {
          clearHold();
        }
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => {
        if (pointerType.current !== "mouse") e.preventDefault();
      }}
      onClick={() => {
        if (!onClick) return;
        if (pointerType.current !== "mouse") return;
        if (held.current) return;
        onClick();
      }}
      className={cn(
        "flex w-full min-h-0 items-center gap-1 overflow-hidden rounded-[3px] px-1.5 text-left text-xs leading-tight",
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

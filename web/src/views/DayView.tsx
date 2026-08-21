import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import { eventChipStyle } from "@/lib/colors";
import { formatTime, fromISO, isSameDay, now, ZONE } from "@/lib/dates";
import { HOUR_HEIGHT, minutesFromClick, packDayEvents } from "@/lib/layout";
import type { CalendarEvent, TaskItem, WorkingHours } from "@/lib/types";
import { EventChip, isDeclined } from "@/components/EventChip";
import { Button } from "@/components/ui/button";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function TimeGrid({
  day,
  events,
  onOpen,
  onCreate,
  onMove,
  showNow,
  secondTimezone,
  workingHours,
  tasks,
  onToggleTask,
}: {
  day: DateTime;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onCreate: (start: DateTime) => void;
  onMove?: (event: CalendarEvent, start: DateTime, end: DateTime) => void;
  showNow?: boolean;
  secondTimezone?: string | null;
  workingHours?: WorkingHours | null;
  tasks?: TaskItem[];
  onToggleTask?: (task: TaskItem) => void;
}) {
  const allDay = events.filter((e) => e.allDay);
  const laid = packDayEvents(events, day);
  const today = now();
  const showLine = Boolean(showNow && isSameDay(day, today));
  const nowTop = ((today.hour * 60 + today.minute) / 60) * HOUR_HEIGHT;
  const gridRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ top: number; height: number; left: string; width: string } | null>(null);
  const holdTimer = useRef(0);
  const openedHold = useRef(false);
  const drag = useRef<{
    event: CalendarEvent;
    mode: "move" | "resize";
    startY: number;
    origTop: number;
    origHeight: number;
    durationMin: number;
    moved: boolean;
  } | null>(null);

  const dayTasks = (tasks ?? []).filter((t) => {
    if (!t.due) return false;
    const due = DateTime.fromISO(t.due, { setZone: true }).setZone(ZONE);
    return due.toISODate() === day.toISODate();
  });

  const hoursOverlay = (() => {
    if (!workingHours?.enabled) return null as { top: number; height: number }[] | null;
    const key = WEEKDAY_KEYS[day.weekday - 1];
    const spec = workingHours.days[key];
    if (!spec) {
      return [{ top: 0, height: 24 * HOUR_HEIGHT }];
    }
    const [sh, sm] = spec.start.split(":").map(Number);
    const [eh, em] = spec.end.split(":").map(Number);
    const startMin = (sh || 0) * 60 + (sm || 0);
    const endMin = (eh || 18) * 60 + (em || 0);
    return [
      { top: 0, height: (startMin / 60) * HOUR_HEIGHT },
      { top: (endMin / 60) * HOUR_HEIGHT, height: 24 * HOUR_HEIGHT - (endMin / 60) * HOUR_HEIGHT },
    ];
  })();

  function dayFromPoint(clientX: number, clientY: number): DateTime {
    const el = document.elementFromPoint(clientX, clientY)?.closest("[data-cal-day]");
    const iso = el?.getAttribute("data-cal-day");
    if (iso) return DateTime.fromISO(iso, { zone: ZONE }).startOf("day");
    return day;
  }

  function onPointerDown(e: ReactPointerEvent, event: CalendarEvent, mode: "move" | "resize", top: number, height: number) {
    if (!onMove || event.allDay) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const durationMin = Math.max(15, Math.round((height / HOUR_HEIGHT) * 60 / 15) * 15);
    openedHold.current = false;
    window.clearTimeout(holdTimer.current);
    drag.current = {
      event,
      mode,
      startY: e.clientY,
      origTop: top,
      origHeight: height,
      durationMin,
      moved: false,
    };
    holdTimer.current = window.setTimeout(() => {
      if (drag.current?.moved) return;
      openedHold.current = true;
      onOpen(event);
    }, 480);
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) {
      d.moved = true;
      window.clearTimeout(holdTimer.current);
    }
    if (d.mode === "move") {
      const top = Math.max(0, Math.min(24 * HOUR_HEIGHT - 16, d.origTop + dy));
      const snapped = (minutesFromClick(top) / 60) * HOUR_HEIGHT;
      setGhost({
        top: snapped,
        height: (d.durationMin / 60) * HOUR_HEIGHT,
        left: "3.25rem",
        width: "calc(100% - 3.5rem)",
      });
    } else {
      const height = Math.max((15 / 60) * HOUR_HEIGHT, d.origHeight + dy);
      const mins = Math.max(15, Math.round((height / HOUR_HEIGHT) * 60 / 15) * 15);
      setGhost({
        top: d.origTop,
        height: (mins / 60) * HOUR_HEIGHT,
        left: "3.25rem",
        width: "calc(100% - 3.5rem)",
      });
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    const d = drag.current;
    window.clearTimeout(holdTimer.current);
    setGhost(null);
    drag.current = null;
    if (!d || !onMove) return;
    if (!d.moved) {
      if (!openedHold.current && e.pointerType === "mouse") onOpen(d.event);
      return;
    }
    const dropDay = d.mode === "move" ? dayFromPoint(e.clientX, e.clientY) : day;
    if (d.mode === "move") {
      const top = Math.max(0, d.origTop + (e.clientY - d.startY));
      const startMin = minutesFromClick(top);
      const start = dropDay.set({ hour: Math.floor(startMin / 60), minute: startMin % 60, second: 0, millisecond: 0 });
      onMove(d.event, start, start.plus({ minutes: d.durationMin }));
    } else {
      const start = fromISO(d.event.startAt) ?? day;
      const height = Math.max((15 / 60) * HOUR_HEIGHT, d.origHeight + (e.clientY - d.startY));
      const mins = Math.max(15, Math.round((height / HOUR_HEIGHT) * 60 / 15) * 15);
      onMove(d.event, start, start.plus({ minutes: mins }));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-cal-day={day.toISODate() ?? ""}>
      {allDay.length || dayTasks.length ? (
        <div className="flex flex-col gap-1 border-b border-border px-2 py-2">
          {allDay.map((e) => (
            <EventChip key={e.id} event={e} onClick={() => onOpen(e)} />
          ))}
          {dayTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "flex min-h-6 items-center gap-2 rounded-[3px] bg-muted px-1.5 text-left text-xs",
                t.status === "completed" && "text-muted-foreground line-through",
              )}
              onClick={() => onToggleTask?.(t)}
            >
              <span className="size-2 shrink-0 rounded-sm border border-foreground/40" />
              {t.title}
            </button>
          ))}
        </div>
      ) : (
        <div className="h-2 border-b border-border" />
      )}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div
          ref={gridRef}
          className="relative"
          style={{ height: 24 * HOUR_HEIGHT }}
          onClick={(ev) => {
            if (drag.current?.moved) return;
            const rect = ev.currentTarget.getBoundingClientRect();
            const y = ev.clientY - rect.top + ev.currentTarget.scrollTop;
            const mins = minutesFromClick(y);
            const start = day.startOf("day").set({ hour: Math.floor(mins / 60), minute: mins % 60 });
            onCreate(start);
          }}
        >
          {hoursOverlay?.map((b, i) => (
            <div
              key={i}
              className="pointer-events-none absolute right-0 left-12 bg-muted/50"
              style={{ top: b.top, height: b.height }}
            />
          ))}
          {HOURS.map((h) => {
            const local = day.set({ hour: h, minute: 0 });
            const other = secondTimezone
              ? local.setZone(secondTimezone).toFormat("HH:mm")
              : null;
            return (
              <div
                key={h}
                className="absolute right-0 left-12 border-t border-border/80"
                style={{ top: h * HOUR_HEIGHT }}
              >
                <span className="absolute -top-2.5 -left-12 w-11 text-right text-[0.6875rem] tabular-nums text-muted-foreground">
                  {String(h).padStart(2, "0")}:00
                  {other ? (
                    <span className="block text-[0.5625rem] leading-none opacity-70">{other}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
          {laid.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={(ev) => ev.stopPropagation()}
              onPointerDown={(ev) => onPointerDown(ev, e, "move", e.top, e.height)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={cn(
                "absolute overflow-hidden rounded-[3px] px-1.5 py-0.5 text-left text-xs leading-tight touch-none",
                isDeclined(e) && "opacity-50 line-through",
              )}
              style={{
                ...eventChipStyle(e.backgroundColor),
                top: e.top,
                height: e.height,
                left: `calc(3.25rem + ${(e.col / e.cols) * 100}% * 0.92)`,
                width: `calc((100% - 3.25rem) / ${e.cols} - 4px)`,
              }}
            >
              <span className="block truncate font-medium">{e.summary || "Ohne Titel"}</span>
              <span className="block truncate opacity-90">
                {fromISO(e.startAt) ? formatTime(fromISO(e.startAt)!) : ""}
              </span>
              {onMove ? (
                <span
                  className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    onPointerDown(ev, e, "resize", e.top, e.height);
                  }}
                />
              ) : null}
            </button>
          ))}
          {ghost ? (
            <div
              className="pointer-events-none absolute z-20 rounded-[3px] bg-primary/30 ring-1 ring-primary"
              style={{ top: ghost.top, height: ghost.height, left: ghost.left, width: ghost.width }}
            />
          ) : null}
          {showLine ? (
            <div
              className="pointer-events-none absolute right-0 left-12 z-10 h-0.5 bg-today"
              style={{ top: nowTop }}
            >
              <span className="absolute -top-1.5 -left-2 size-3 rounded-full bg-today" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DayView({
  day,
  events,
  onOpen,
  onCreate,
  onMove,
  agendaBeside,
  secondTimezone,
  workingHours,
  tasks,
  onToggleTask,
}: {
  day: DateTime;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onCreate: (start: DateTime) => void;
  onMove?: (event: CalendarEvent, start: DateTime, end: DateTime) => void;
  agendaBeside?: boolean;
  secondTimezone?: string | null;
  workingHours?: WorkingHours | null;
  tasks?: TaskItem[];
  onToggleTask?: (task: TaskItem) => void;
}) {
  const tzBanner = events.find(
    (e) => e.timezone && e.timezone !== ZONE && e.timezone !== e.calendarTimezone,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tzBanner ? (
          <p className="px-3 py-1 text-xs text-muted-foreground">
            Manche Termine in {tzBanner.timezone}
          </p>
        ) : null}
        <TimeGrid
          day={day}
          events={events}
          onOpen={onOpen}
          onCreate={onCreate}
          onMove={onMove}
          showNow
          secondTimezone={secondTimezone}
          workingHours={workingHours}
          tasks={tasks}
          onToggleTask={onToggleTask}
        />
      </div>
      {agendaBeside ? (
        <aside className="hidden w-72 shrink-0 overflow-auto border-l border-border p-3 lg:block">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">An diesem Tag</h2>
          {events.length ? (
            events.map((e) => (
              <Button
                key={e.id}
                variant="ghost"
                className="mb-1 h-auto min-h-11 w-full justify-start whitespace-normal text-left leading-snug"
                onClick={() => onOpen(e)}
              >
                {e.summary || "Ohne Titel"}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Keine Termine</p>
          )}
        </aside>
      ) : null}
    </div>
  );
}

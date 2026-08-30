import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoginScreen } from "@/components/LoginScreen";
import { AppLogo } from "@/components/AppLogo";
import { AppSwitcher } from "@/components/AppSwitcher";
import { MobileBottomStack, MobileDock } from "@/components/MobileDock";
import { ModuleDock } from "@/components/ModuleDock";
import { MiniNavigator, type MiniRange } from "@/components/MiniMonth";
import { CalendarList } from "@/components/CalendarList";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { EventEditor, type EditorState } from "@/components/EventEditor";
import { isDeclined } from "@/components/EventChip";
import { AgendaView } from "@/views/AgendaView";
import { DayView } from "@/views/DayView";
import { WeekView } from "@/views/WeekView";
import { MonthView } from "@/views/MonthView";
import { YearView } from "@/views/YearView";
import { SearchView } from "@/views/SearchView";
import { TasksView } from "@/views/TasksView";
import { apiClient, ApiError } from "@/lib/api";
import { syncExistingPushSubscription } from "@/lib/push";
import {
  dayTitleParts,
  eventOverlapsDay,
  fromISO,
  monthTitle,
  now,
  startOfWeek,
  visibleRange,
  ZONE,
} from "@/lib/dates";
import type { CalendarEvent, CalendarItem, Me, MobileTab, RecurrenceScope, TaskItem, ViewId } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Toaster } from "@/components/ui/sonner";
import { MailApp } from "@/mail/MailApp";
import { ContactsView } from "@/views/ContactsView";
import type { AppModule } from "@/mail/types";
import { useLiveSync } from "@/lib/liveSync";
import { useTheme } from "@/components/ThemeProvider";
import { useChrome } from "@/components/ChromeProvider";
import { ChromeSwitcher } from "@/components/ChromeSwitcher";
import { fabClearance, panelClass } from "@/lib/platform";
import { PullToRefresh } from "@/components/PullToRefresh";
import { DateField, TimeField } from "@/components/DateTimeFields";
import { cn } from "@/lib/utils";

function useDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const fn = () => setDesktop(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return desktop;
}

function handleAuthError(err: unknown, onReauth: () => void) {
  if (err instanceof ApiError && (err.status === 401 || err.code === "reauth")) {
    toast.error("Bitte erneut anmelden.");
    onReauth();
    return true;
  }
  return false;
}

function CalendarApp({
  me,
  onLogout,
  module,
  onModule,
  onOpenSettings,
}: {
  me: Me;
  onLogout: () => void;
  module: AppModule;
  onModule: (next: AppModule) => void;
  onOpenSettings: () => void;
}) {
  const desktop = useDesktop();
  const { setTheme, dark } = useTheme();
  const { chrome } = useChrome();
  const [weekStart, setWeekStart] = useState<0 | 1>(me.weekStart);
  const [cursor, setCursor] = useState(() => now());
  const [view, setView] = useState<ViewId>(desktop ? "week" : "agenda");
  const [mobileTab, setMobileTab] = useState<MobileTab>("today");
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [miniRange, setMiniRange] = useState<MiniRange>(
    () => (localStorage.getItem("kalender-mini-range") as MiniRange) || "month",
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    event: CalendarEvent;
    start: string;
    end: string;
  } | null>(null);
  const [moveScope, setMoveScope] = useState<RecurrenceScope>("this");
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);
  const [reschedule, setReschedule] = useState<CalendarEvent | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("09:00");
  const [taskCompose, setTaskCompose] = useState(false);

  const effectiveView: ViewId = desktop
    ? searchOpen
      ? "agenda"
      : view
    : mobileTab === "today"
      ? "agenda"
      : mobileTab === "search"
        ? "agenda"
        : view === "agenda"
          ? "month"
          : view;

  const range = useMemo(
    () => visibleRange(cursor, desktop ? view : effectiveView, weekStart),
    [cursor, desktop, view, effectiveView, weekStart],
  );

  const loadEvents = useCallback(async () => {
    const { events: next } = await apiClient.events(
      range.from.toUTC().toISO() ?? "",
      range.to.toUTC().toISO() ?? "",
    );
    setEvents(next);
  }, [range.from, range.to]);

  const loadCalendars = useCallback(async () => {
    const { calendars: next } = await apiClient.calendars();
    setCalendars(next);
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const res = await apiClient.tasks();
      setTasks(res.tasks);
      setTasksError(null);
    } catch (err) {
      setTasks([]);
      setTasksError(err instanceof ApiError ? err.message : "Aufgaben nicht verfügbar.");
    }
  }, []);

  const syncInflight = useRef(false);
  const lastSilentSync = useRef(0);

  const sync = useCallback(
    async (silent = false) => {
      if (silent) {
        if (syncInflight.current) return;
        if (Date.now() - lastSilentSync.current < 30_000) return;
      }
      syncInflight.current = true;
      if (!silent) setSyncing(true);
      try {
        await apiClient.sync(
          silent ? range.from.toUTC().toISO() ?? undefined : undefined,
          silent ? range.to.toUTC().toISO() ?? undefined : undefined,
          !silent,
        );
        await Promise.all([loadCalendars(), loadEvents(), loadTasks()]);
        lastSilentSync.current = Date.now();
        if (!silent) toast.success("Kalender aktualisiert.");
      } catch (err) {
        if (!handleAuthError(err, onLogout) && !silent) {
          toast.error(err instanceof ApiError ? err.message : "Aktualisierung fehlgeschlagen.");
        }
      } finally {
        syncInflight.current = false;
        setSyncing(false);
      }
    },
    [loadCalendars, loadEvents, loadTasks, onLogout, range.from, range.to],
  );

  useEffect(() => {
    loadCalendars().catch((err) => handleAuthError(err, onLogout));
  }, [loadCalendars, onLogout]);

  useEffect(() => {
    loadEvents().catch((err) => handleAuthError(err, onLogout));
  }, [loadEvents, onLogout]);

  useEffect(() => {
    loadTasks().catch(() => undefined);
  }, [loadTasks]);

  useEffect(() => {
    sync(true).catch(() => undefined);
  }, []); // initial pull

  const onLive = useCallback(
    (kind: "calendar" | "mail" | "contacts") => {
      if (kind === "calendar" || kind === "contacts") {
        loadCalendars().catch(() => undefined);
        loadEvents().catch(() => undefined);
      }
    },
    [loadCalendars, loadEvents],
  );
  useLiveSync(onLive);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") sync(true).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [sync]);

  const visibleEvents = useMemo(() => {
    const selected = new Set(calendars.filter((c) => c.selected).map((c) => c.id));
    return events.filter((e) => selected.has(e.calendarId) && (!me.hideDeclined || !isDeclined(e)));
  }, [calendars, events, me.hideDeclined]);

  function shift(dir: number) {
    const v = effectiveView;
    if (v === "day" || v === "agenda") {
      setCursor((c) => c.plus({ days: dir }));
    } else if (v === "week") {
      setCursor((c) => c.plus({ weeks: dir }));
    } else if (v === "year") {
      setCursor((c) => c.plus({ years: dir }));
    } else {
      setCursor((c) => c.plus({ months: dir }));
    }
  }

  function openNew(start?: DateTime) {
    const s = start ?? now().set({ second: 0, millisecond: 0 });
    const rounded = s.set({ minute: Math.round(s.minute / 15) * 15 });
    setEditor({
      open: true,
      event: null,
      defaults: {
        start: rounded,
        end: rounded.plus({ hours: 1 }),
        calendarId: calendars.find((c) => c.primary)?.id,
      },
    });
  }

  async function applyMove(event: CalendarEvent, start: DateTime, end: DateTime, scope: RecurrenceScope) {
    try {
      await apiClient.patchEvent(event.id, {
        start: event.allDay ? start.toISODate() : start.toISO({ suppressMilliseconds: true }),
        end: event.allDay ? end.toISODate() : end.toISO({ suppressMilliseconds: true }),
        allDay: event.allDay,
        timezone: event.timezone,
        scope: event.recurringEventId ? scope : undefined,
      });
      await loadEvents();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Verschieben fehlgeschlagen.");
    }
  }

  async function duplicateEvent(event: CalendarEvent) {
    try {
      await apiClient.createEvent({
        summary: `Kopie: ${event.summary || "Ohne Titel"}`,
        calendarId: event.calendarId,
        allDay: event.allDay,
        start: event.allDay ? event.allDayStart : event.startAt,
        end: event.allDay ? event.allDayEnd : event.endAt,
        timezone: event.timezone || ZONE,
        location: event.location,
        description: event.description,
      });
      toast.success("Kopie erstellt.");
      await loadEvents();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Duplizieren fehlgeschlagen.");
    }
  }

  async function deleteEvent(event: CalendarEvent) {
    try {
      await apiClient.deleteEvent(event.id, event.recurringEventId ? "this" : "this");
      toast.success("Termin gelöscht.");
      setPendingDelete(null);
      await loadEvents();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  function openReschedule(event: CalendarEvent) {
    const start = event.allDay
      ? DateTime.fromISO(event.allDayStart ?? "")
      : fromISO(event.startAt);
    setReschedule(event);
    setRescheduleDate(start?.toISODate() ?? now().toISODate() ?? "");
    setRescheduleTime(start && !event.allDay ? start.toFormat("HH:mm") : "09:00");
  }

  function confirmReschedule() {
    if (!reschedule) return;
    let start: DateTime;
    let end: DateTime;
    if (reschedule.allDay) {
      const oldStart = DateTime.fromISO(reschedule.allDayStart ?? "");
      const oldEnd = DateTime.fromISO(reschedule.allDayEnd ?? oldStart.plus({ days: 1 }).toISODate() ?? "");
      const days = Math.max(1, oldEnd.diff(oldStart, "days").days);
      start = DateTime.fromISO(rescheduleDate);
      end = start.plus({ days });
    } else {
      const oldStart = fromISO(reschedule.startAt) ?? now();
      const oldEnd = fromISO(reschedule.endAt) ?? oldStart.plus({ hours: 1 });
      const duration = oldEnd.diff(oldStart);
      start = DateTime.fromISO(`${rescheduleDate}T${rescheduleTime}`, { zone: ZONE });
      end = start.plus(duration);
    }
    setReschedule(null);
    onMove(reschedule, start, end);
  }

  function onMove(event: CalendarEvent, start: DateTime, end: DateTime) {
    if (event.recurringEventId) {
      setPendingMove({
        event,
        start: start.toISO({ suppressMilliseconds: true }) ?? "",
        end: end.toISO({ suppressMilliseconds: true }) ?? "",
      });
      setMoveScope("this");
      return;
    }
    void applyMove(event, start, end, "this");
  }

  async function toggleTask(task: TaskItem) {
    try {
      await apiClient.patchTask(task.listId, task.id, {
        status: task.status === "completed" ? "needsAction" : "completed",
      });
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Aufgabe fehlgeschlagen.");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "Escape") {
        setEditor((s) => ({ ...s, open: false }));
        setSearchOpen(false);
        return;
      }
      if (typing) return;
      if (e.key === "t") setCursor(now());
      if (e.key === "n") {
        if (!desktop && mobileTab === "tasks") setTaskCompose(true);
        else openNew();
      }
      if (e.key === "/") {
        e.preventDefault();
        if (desktop) setSearchOpen(true);
        else setMobileTab("search");
        requestAnimationFrame(() => document.getElementById("calendar-search")?.focus());
      }
      if (e.key === "ArrowLeft") shift(-1);
      if (e.key === "ArrowRight") shift(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dayHeading =
    effectiveView === "day" || effectiveView === "agenda" || (!desktop && mobileTab === "today");
  const agendaHeading = effectiveView === "agenda" || (!desktop && mobileTab === "today");
  const tasksTab = !desktop && mobileTab === "tasks";
  const title = useMemo(() => {
    if (tasksTab) return "Aufgaben";
    if (dayHeading) return dayTitleParts(cursor);
    if (effectiveView === "year") return String(cursor.year);
    if (effectiveView === "week") {
      const s = startOfWeek(cursor, weekStart);
      const kw = s.weekNumber;
      return `KW ${kw} · ${s.toFormat("d.")}–${s.plus({ days: 6 }).toFormat("d. LLLL yyyy")}`;
    }
    return monthTitle(cursor);
  }, [cursor, dayHeading, effectiveView, tasksTab, weekStart]);

  const header = (
    <header className="flex flex-col gap-2 border-b border-border px-3 py-2 lg:flex-row lg:items-center lg:gap-3 lg:px-6 lg:py-3">
      <div className="flex min-w-0 items-center gap-1 lg:gap-2">
        {tasksTab ? null : (
          <>
            <Button
              variant="outline"
              className="h-8 min-h-8 shrink-0 px-2.5 text-[0.8125rem] lg:h-11 lg:min-h-11 lg:px-4 lg:text-sm"
              onClick={() => setCursor(now())}
            >
              Heute
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 lg:size-11"
              aria-label="Zurück"
              onClick={() => shift(-1)}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 lg:size-11"
              aria-label="Weiter"
              onClick={() => shift(1)}
            >
              <ChevronRight className="size-5" />
            </Button>
          </>
        )}
        <h1 className="min-w-0 flex-1 break-words text-base font-semibold tracking-tight capitalize leading-tight lg:text-xl">
          {typeof title === "string" ? (
            title
          ) : agendaHeading ? (
            <>
              <span className="block text-[0.95rem] font-bold leading-tight lg:text-lg">{title.weekday}</span>
              <span className="block text-[0.75rem] font-medium leading-snug lg:text-sm">{title.date}</span>
            </>
          ) : (
            <>
              <span className="block font-bold">{title.weekday}</span>
              <span className="block font-medium">{title.date}</span>
            </>
          )}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 lg:size-11"
          aria-label="Aktualisieren"
          disabled={syncing}
          onClick={() => void sync()}
        >
          <RefreshCw className={cn("size-5", syncing && "animate-spin")} />
        </Button>
      </div>
      <div className="hidden flex-1 justify-center lg:flex">
        <ViewSwitcher
          value={view}
          withAgenda
          onChange={(v) => {
            setSearchOpen(false);
            setView(v);
          }}
        />
      </div>
      <div className="hidden items-center gap-2 lg:flex">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Suche"
          onClick={() => setSearchOpen((s) => !s)}
        >
          <Search className="size-5" />
        </Button>
        <a
          href={`/api/events/export.ics?from=${encodeURIComponent(range.from.toUTC().toISO() ?? "")}&to=${encodeURIComponent(range.to.toUTC().toISO() ?? "")}`}
        >
          <Button variant="ghost" size="icon" aria-label="ICS exportieren">
            ICS
          </Button>
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Konto" />
            }
          >
            <Avatar className="size-8">
              {me.pictureUrl ? <AvatarImage src={me.pictureUrl} alt="" /> : null}
              <AvatarFallback>{(me.name ?? me.email).slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-2 text-sm">
              <div className="font-medium">{me.name}</div>
              <div className="text-muted-foreground">{me.email}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings}>Einstellungen</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                apiClient.logout().finally(onLogout);
              }}
            >
              Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );

  const onOpenEvent = (event: CalendarEvent) => setEditor({ open: true, event });

  let main: ReactNode;
  if (!desktop && mobileTab === "search") {
    main = <SearchView onOpen={onOpenEvent} onDelete={setPendingDelete} onDuplicate={(e) => void duplicateEvent(e)} onMove={openReschedule} />;
  } else if (!desktop && mobileTab === "more") {
    main = (
      <div className="flex flex-col gap-6 px-4 py-4 pb-44">
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Darstellung</h2>
          <div className={cn("p-4", panelClass(chrome))}>
            <ChromeSwitcher className="mb-3" />
            <div className="flex min-h-11 items-center justify-between gap-3">
              <Label>Dunkles Design</Label>
              <Switch
                checked={dark}
                onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
              />
            </div>
            <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
              <Label>Woche beginnt am Sonntag</Label>
              <Switch
                checked={weekStart === 0}
                onCheckedChange={(v) => {
                  const next: 0 | 1 = v ? 0 : 1;
                  setWeekStart(next);
                  localStorage.setItem("kalender-week-start", String(next));
                  apiClient.patchMe({ weekStart: next }).catch(() => undefined);
                }}
              />
            </div>
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Kalender</h2>
          <div className={cn("p-3", panelClass(chrome))}>
            <CalendarList
              calendars={calendars}
              onFeedsChanged={() => void loadCalendars().then(() => loadEvents())}
              onToggle={async (id, selected) => {
                setCalendars((cs) => cs.map((c) => (c.id === id ? { ...c, selected } : c)));
                await apiClient.patchCalendar(id, selected);
              }}
            />
          </div>
        </section>
        <Button variant="outline" className="min-h-11" disabled={syncing} onClick={() => void sync()}>
          <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
          Kalender aktualisieren
        </Button>
        <Button variant="outline" onClick={onOpenSettings}>
          Einstellungen
        </Button>
        <Button
          variant="outline"
          onClick={() => apiClient.logout().finally(onLogout)}
        >
          Abmelden
        </Button>
      </div>
    );
  } else if (!desktop && mobileTab === "tasks") {
    main = (
      <div className="min-h-0 flex-1 overflow-auto">
        <TasksView
          tasks={tasks}
          error={tasksError}
          onReload={() => void loadTasks()}
          composeOpen={taskCompose}
          onComposeOpenChange={setTaskCompose}
        />
      </div>
    );
  } else if (desktop && searchOpen) {
    main = <SearchView onOpen={onOpenEvent} onDelete={setPendingDelete} onDuplicate={(e) => void duplicateEvent(e)} onMove={openReschedule} />;
  } else if (effectiveView === "agenda" || (!desktop && mobileTab === "today")) {
    main = (
      <div className="min-h-0 flex-1 overflow-auto">
        {!desktop ? (
          <div className="px-3 pt-2">
            <MiniNavigator
              cursor={cursor}
              weekStart={weekStart}
              range={miniRange}
              collapsible
              onRangeChange={(next) => {
                setMiniRange(next);
                localStorage.setItem("kalender-mini-range", next);
              }}
              onSelect={(d) => setCursor(d)}
            />
          </div>
        ) : null}
        <div className={desktop ? "mx-auto max-w-3xl py-2" : undefined}>
          <AgendaView
            events={visibleEvents}
            from={cursor}
            onOpen={onOpenEvent}
            onDelete={setPendingDelete}
            onDuplicate={(e) => void duplicateEvent(e)}
            onMove={openReschedule}
          />
        </div>
      </div>
    );
  } else if (view === "day") {
    main = (
      <DayView
        day={cursor}
        events={visibleEvents.filter((e) => eventOverlapsDay(e, cursor))}
        onOpen={onOpenEvent}
        onCreate={(s) => openNew(s)}
        onMove={onMove}
        agendaBeside={false}
        secondTimezone={me.secondTimezone}
        workingHours={me.workingHours}
        tasks={tasks}
        onToggleTask={(t) => void toggleTask(t)}
      />
    );
  } else if (view === "week") {
    main = (
      <WeekView
        cursor={cursor}
        weekStart={weekStart}
        events={visibleEvents}
        onOpen={onOpenEvent}
        onCreate={(s) => openNew(s)}
        onMove={onMove}
        compact={!desktop}
        secondTimezone={me.secondTimezone}
        workingHours={me.workingHours}
        tasks={tasks}
        onToggleTask={(t) => void toggleTask(t)}
      />
    );
  } else if (view === "year") {
    main = (
      <YearView
        cursor={cursor}
        weekStart={weekStart}
        onSelectMonth={(m) => {
          setCursor(m);
          setView("month");
          if (!desktop) setMobileTab("calendar");
        }}
      />
    );
  } else {
    main = (
      <MonthView
        cursor={cursor}
        weekStart={weekStart}
        events={visibleEvents}
        onSelectDay={(d) => {
          setCursor(d);
          setView("day");
        }}
        onOpen={onOpenEvent}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col gap-6 overflow-auto border-r border-border p-4 lg:flex">
          <div className="flex items-center gap-2.5">
            <AppLogo className="size-9" size={36} />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold leading-snug">Kalender & Mail</p>
              <p className="text-xs text-muted-foreground">Workspace</p>
            </div>
          </div>
          <AppSwitcher value={module} onChange={onModule} />
          <div>
            <p className="mb-2 text-4xl font-semibold tracking-tight">{cursor.day}</p>
            <p className="text-muted-foreground capitalize">{monthTitle(cursor)}</p>
          </div>
          <MiniNavigator
            cursor={cursor}
            weekStart={weekStart}
            range={miniRange}
            onRangeChange={(next) => {
              setMiniRange(next);
              localStorage.setItem("kalender-mini-range", next);
            }}
            onSelect={setCursor}
          />
          <CalendarList
            calendars={calendars}
            onFeedsChanged={() => void loadCalendars().then(() => loadEvents())}
            onToggle={async (id, selected) => {
              setCalendars((cs) => cs.map((c) => (c.id === id ? { ...c, selected } : c)));
              try {
                await apiClient.patchCalendar(id, selected);
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : "Kalender nicht aktualisiert.");
              }
            }}
          />
          <div className="mt-auto flex min-h-11 items-center justify-between gap-3 pt-4">
            <Label className="text-muted-foreground">Dunkel</Label>
            <Switch checked={dark} onCheckedChange={(v) => setTheme(v ? "dark" : "light")} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          {!desktop && mobileTab === "calendar" ? (
            <div className="px-3 py-1.5">
              <ViewSwitcher value={view === "agenda" ? "month" : view} onChange={setView} />
            </div>
          ) : null}
          <PullToRefresh
            className="min-h-0 flex-1 overflow-hidden"
            onRefresh={() => sync()}
            disabled={syncing}
          >
            {main}
          </PullToRefresh>
        </div>
        <aside className="hidden w-80 shrink-0 flex-col overflow-hidden border-l border-border lg:flex">
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <TasksView
              tasks={tasks}
              error={tasksError}
              onReload={() => void loadTasks()}
              compact
              composeOpen={taskCompose}
              onComposeOpenChange={setTaskCompose}
            />
          </div>
        </aside>
      </div>
      <Button
        className="fixed right-4 z-40 size-14 rounded-full shadow-lg lg:right-[21.5rem] lg:bottom-6"
        style={{
          bottom: desktop
            ? undefined
            : fabClearance(chrome, 2),
        }}
        size="icon"
        aria-label={tasksTab ? "Neue Aufgabe" : "Neuer Termin"}
        onClick={() => {
          if (tasksTab) setTaskCompose(true);
          else openNew();
        }}
      >
        <Plus className="size-6" />
      </Button>
      {!desktop ? (
        <MobileBottomStack>
          <MobileDock
            value={mobileTab}
            onChange={(tab) => {
              setMobileTab(tab);
              if (tab !== "tasks") setTaskCompose(false);
              if (tab === "today") setView("agenda");
              if (tab === "calendar" && view === "agenda") setView("month");
            }}
          />
          <ModuleDock value={module} onChange={onModule} />
        </MobileBottomStack>
      ) : null}
      <EventEditor
        state={editor}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        calendars={calendars}
        desktop={desktop}
        onOpenEvent={(event) => setEditor({ open: true, event })}
        onSaved={() => {
          loadEvents().catch(() => undefined);
          sync(true).catch(() => undefined);
        }}
        onDeleted={() => {
          loadEvents().catch(() => undefined);
        }}
      />
      <Dialog open={Boolean(pendingMove)} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Serientermin verschieben</DialogTitle>
          </DialogHeader>
          <Select value={moveScope} onValueChange={(v) => setMoveScope(v as RecurrenceScope)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this">Nur dieses Ereignis</SelectItem>
              <SelectItem value="thisAndFollowing">Dieses und folgende</SelectItem>
              <SelectItem value="all">Alle Ereignisse</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMove(null)}>Abbrechen</Button>
            <Button
              onClick={() => {
                if (!pendingMove) return;
                const start = DateTime.fromISO(pendingMove.start, { setZone: true });
                const end = DateTime.fromISO(pendingMove.end, { setZone: true });
                void applyMove(pendingMove.event, start, end, moveScope);
                setPendingMove(null);
              }}
            >
              Verschieben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Termin löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingDelete?.summary || "Ohne Titel"} wird in Google Calendar gelöscht.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => pendingDelete && void deleteEvent(pendingDelete)}>
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reschedule)} onOpenChange={(open) => { if (!open) setReschedule(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Termin verschieben</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Datum</Label>
              <DateField value={rescheduleDate} onValueChange={setRescheduleDate} />
            </div>
            {reschedule && !reschedule.allDay ? (
              <div className="flex flex-col gap-1.5">
                <Label>Uhrzeit</Label>
                <TimeField value={rescheduleTime} onValueChange={setRescheduleTime} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedule(null)}>Abbrechen</Button>
            <Button onClick={confirmReschedule}>Verschieben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [module, setModule] = useState<AppModule>(() => {
    if (typeof window === "undefined") return "calendar";
    const q = new URLSearchParams(window.location.search).get("module");
    if (q === "mail" || q === "calendar" || q === "contacts") return q;
    const stored = window.localStorage.getItem("app-module");
    if (stored === "mail" || stored === "contacts") return stored;
    return "calendar";
  });
  const [mailTo, setMailTo] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("to");
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threaded, setThreaded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("mail-threaded") !== "false";
  });

  function onModule(next: AppModule) {
    setModule(next);
    window.localStorage.setItem("app-module", next);
  }

  function onThreadedChange(next: boolean) {
    setThreaded(next);
    window.localStorage.setItem("mail-threaded", String(next));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("module");
    if (q === "mail" || q === "calendar" || q === "contacts") {
      window.localStorage.setItem("app-module", q);
    }
    if (params.get("to")) setMailTo(params.get("to"));
    if (!params.has("module") && !params.has("to")) return;
    params.delete("module");
    params.delete("to");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    apiClient
      .me()
      .then(setMe)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setMe(null);
        else {
          toast.error("Verbindung fehlgeschlagen.");
          setMe(null);
        }
      });
  }, []);

  useEffect(() => {
    if (!me?.id) return;
    syncExistingPushSubscription().catch(() => undefined);
  }, [me?.id]);

  if (me === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        Laden…
      </div>
    );
  }
  if (!me) {
    return (
      <>
        <LoginScreen />
        <Toaster />
      </>
    );
  }
  return (
    <>
      {module === "mail" ? (
        <MailApp
          me={me}
          onLogout={() => setMe(null)}
          module={module}
          onModule={onModule}
          threaded={threaded}
          onOpenSettings={() => setSettingsOpen(true)}
          composeTo={mailTo}
          onComposeToConsumed={() => setMailTo(null)}
        />
      ) : module === "contacts" ? (
        <ContactsView
          me={me}
          onLogout={() => setMe(null)}
          module={module}
          onModule={onModule}
          onOpenSettings={() => setSettingsOpen(true)}
          onMailTo={(email) => {
            setMailTo(email);
            onModule("mail");
          }}
        />
      ) : (
        <CalendarApp
          me={me}
          onLogout={() => setMe(null)}
          module={module}
          onModule={onModule}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        me={me}
        onMeChange={setMe}
        threaded={threaded}
        onThreadedChange={onThreadedChange}
      />
      <Toaster />
    </>
  );
}

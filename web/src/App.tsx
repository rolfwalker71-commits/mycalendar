import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Search } from "lucide-react";
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
import { AppSwitcher } from "@/components/AppSwitcher";
import { MobileDock } from "@/components/MobileDock";
import { MiniMonth, MiniNavigator, type MiniRange } from "@/components/MiniMonth";
import { CalendarList } from "@/components/CalendarList";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { EventEditor, type EditorState } from "@/components/EventEditor";
import { AgendaView } from "@/views/AgendaView";
import { DayView } from "@/views/DayView";
import { WeekView } from "@/views/WeekView";
import { MonthView } from "@/views/MonthView";
import { YearView } from "@/views/YearView";
import { SearchView } from "@/views/SearchView";
import { apiClient, ApiError } from "@/lib/api";
import { syncExistingPushSubscription } from "@/lib/push";
import {
  dayTitleParts,
  eventOverlapsDay,
  monthTitle,
  now,
  startOfWeek,
  visibleRange,
  ZONE,
} from "@/lib/dates";
import type { CalendarEvent, CalendarItem, Me, MobileTab, ViewId } from "@/lib/types";
import { Toaster } from "@/components/ui/sonner";
import { SettingsDialog } from "@/components/SettingsDialog";
import { MailApp } from "@/mail/MailApp";
import type { AppModule } from "@/mail/types";
import { useTheme } from "@/components/ThemeProvider";
import { PullToRefresh } from "@/components/PullToRefresh";
import { HeaderWeather } from "@/components/WeatherMark";

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
  const [weekStart, setWeekStart] = useState<0 | 1>(me.weekStart);
  const [cursor, setCursor] = useState(() => now());
  const [view, setView] = useState<ViewId>(desktop ? "week" : "agenda");
  const [mobileTab, setMobileTab] = useState<MobileTab>("today");
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(me.lastSyncAt);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [miniRange, setMiniRange] = useState<MiniRange>(
    () => (localStorage.getItem("kalender-mini-range") as MiniRange) || "month",
  );
  const [searchOpen, setSearchOpen] = useState(false);

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

  const sync = useCallback(
    async (silent = false) => {
      if (!silent) setSyncing(true);
      try {
        const res = await apiClient.sync(
          range.from.toUTC().toISO() ?? undefined,
          range.to.toUTC().toISO() ?? undefined,
        );
        setLastSync(res.lastSyncAt);
        await loadCalendars();
        await loadEvents();
      } catch (err) {
        if (!handleAuthError(err, onLogout) && !silent) {
          toast.error(err instanceof ApiError ? err.message : "Aktualisierung fehlgeschlagen.");
        }
      } finally {
        setSyncing(false);
      }
    },
    [loadCalendars, loadEvents, onLogout, range.from, range.to],
  );

  useEffect(() => {
    loadCalendars().catch((err) => handleAuthError(err, onLogout));
  }, [loadCalendars, onLogout]);

  useEffect(() => {
    loadEvents().catch((err) => handleAuthError(err, onLogout));
  }, [loadEvents, onLogout]);

  useEffect(() => {
    sync(true).catch(() => undefined);
  }, []); // initial pull

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") sync(true).catch(() => undefined);
    }, 90_000);
    const onVis = () => {
      if (document.visibilityState === "visible") sync(true).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [sync]);

  const visibleEvents = useMemo(() => {
    const selected = new Set(calendars.filter((c) => c.selected).map((c) => c.id));
    return events.filter((e) => selected.has(e.calendarId));
  }, [calendars, events]);

  function shift(dir: number) {
    if (view === "day" || (!desktop && mobileTab === "today")) {
      setCursor((c) => c.plus({ days: dir }));
    } else if (view === "week") {
      setCursor((c) => c.plus({ weeks: dir }));
    } else if (view === "year") {
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
      if (e.key === "n") openNew();
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

  const dayHeading = view === "day" || (!desktop && mobileTab === "today");
  const title = useMemo(() => {
    if (dayHeading) return dayTitleParts(cursor);
    if (view === "year") return String(cursor.year);
    if (view === "week") {
      const s = startOfWeek(cursor, weekStart);
      return `${s.toFormat("d.")}–${s.plus({ days: 6 }).toFormat("d. LLLL yyyy")}`;
    }
    return monthTitle(cursor);
  }, [cursor, dayHeading, view, weekStart]);

  const header = (
    <header className="flex flex-col gap-3 border-b border-border px-3 py-3 lg:flex-row lg:items-center lg:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <AppSwitcher value={module} onChange={onModule} />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setCursor(now())}>
          Heute
        </Button>
        <Button variant="ghost" size="icon" aria-label="Zurück" onClick={() => shift(-1)}>
          <ChevronLeft className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Weiter" onClick={() => shift(1)}>
          <ChevronRight className="size-5" />
        </Button>
        <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight capitalize leading-tight lg:text-2xl">
          {typeof title === "string" ? (
            title
          ) : (
            <>
              <span className="block">{title.weekday}</span>
              <span className="block">{title.date}</span>
            </>
          )}
        </h1>
        <HeaderWeather />
        {syncing ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            Aktualisiert…
          </span>
        ) : lastSync ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {DateTime.fromISO(lastSync).setZone(ZONE).toFormat("HH:mm")}
          </span>
        ) : null}
      </div>
      <div className="hidden flex-1 justify-center lg:flex">
        <ViewSwitcher
          value={view === "agenda" ? "week" : view}
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
    main = <SearchView onOpen={onOpenEvent} />;
  } else if (!desktop && mobileTab === "more") {
    main = (
      <div className="flex flex-col gap-6 px-4 py-4 pb-28">
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Darstellung</h2>
          <div className="rounded-2xl bg-card p-4 shadow-lg shadow-black/10 ring-1 ring-border">
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
          <div className="rounded-2xl bg-card p-3 shadow-lg shadow-black/10 ring-1 ring-border">
            <CalendarList
              calendars={calendars}
              onToggle={async (id, selected) => {
                setCalendars((cs) => cs.map((c) => (c.id === id ? { ...c, selected } : c)));
                await apiClient.patchCalendar(id, selected);
              }}
            />
          </div>
        </section>
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
  } else if (desktop && searchOpen) {
    main = <SearchView onOpen={onOpenEvent} />;
  } else if (effectiveView === "agenda" || (!desktop && mobileTab === "today")) {
    main = (
      <div className="min-h-0 flex-1 overflow-auto">
        {!desktop ? (
          <div className="px-3 pt-2">
            <MiniNavigator
              cursor={cursor}
              weekStart={weekStart}
              range={miniRange}
              onRangeChange={(next) => {
                setMiniRange(next);
                localStorage.setItem("kalender-mini-range", next);
              }}
              onSelect={(d) => setCursor(d)}
            />
          </div>
        ) : null}
        <AgendaView
          events={visibleEvents}
          from={cursor}
          onOpen={onOpenEvent}
          geminiAvailable={me.geminiAvailable}
        />
      </div>
    );
  } else if (view === "day") {
    main = (
      <DayView
        day={cursor}
        events={visibleEvents.filter((e) => eventOverlapsDay(e, cursor))}
        onOpen={onOpenEvent}
        onCreate={(s) => openNew(s)}
        agendaBeside={desktop}
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
        compact={!desktop}
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
          <AppSwitcher value={module} onChange={onModule} />
          <div>
            <p className="mb-2 text-5xl font-semibold tracking-tight">{cursor.day}</p>
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
            <div className="px-3 py-2">
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
      </div>
      <Button
        className="fixed right-4 z-40 size-14 rounded-full shadow-lg lg:bottom-6"
        style={{ bottom: desktop ? undefined : "calc(5.5rem + env(safe-area-inset-bottom))" }}
        size="icon"
        aria-label="Neuer Termin"
        onClick={() => openNew()}
      >
        <Plus className="size-6" />
      </Button>
      {!desktop ? (
        <MobileDock
          value={mobileTab}
          onChange={(tab) => {
            setMobileTab(tab);
            if (tab === "today") setView("agenda");
            if (tab === "calendar" && view === "agenda") setView("month");
          }}
        />
      ) : null}
      <EventEditor
        state={editor}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        calendars={calendars}
        desktop={desktop}
        onSaved={() => {
          loadEvents().catch(() => undefined);
          sync(true).catch(() => undefined);
        }}
        onDeleted={() => {
          loadEvents().catch(() => undefined);
        }}
      />
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [module, setModule] = useState<AppModule>(() => {
    if (typeof window === "undefined") return "calendar";
    const q = new URLSearchParams(window.location.search).get("module");
    if (q === "mail" || q === "calendar") return q;
    return window.localStorage.getItem("app-module") === "mail" ? "mail" : "calendar";
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
    if (q === "mail" || q === "calendar") {
      window.localStorage.setItem("app-module", q);
    }
    if (!params.has("module")) return;
    params.delete("module");
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

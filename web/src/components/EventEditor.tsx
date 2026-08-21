import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Copy, Download, Paperclip, Video, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { DateField, TimeField } from "@/components/DateTimeFields";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api";
import { EventMapSnippet } from "@/components/EventMap";
import { EventArtBanner } from "@/components/EventArt";
import { LocationField } from "@/components/LocationField";
import { nthWeekdayOfMonth, ZONE } from "@/lib/dates";
import type { CalendarEvent, CalendarItem, RecurrenceScope } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
];

function buildRrule(
  preset: string,
  start: DateTime,
  endMode: string,
  until: string,
  count: string,
): string[] | undefined {
  if (preset === "none") return undefined;
  let rule = "";
  if (preset === "daily") rule = "RRULE:FREQ=DAILY";
  else if (preset === "weekdays") rule = "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  else if (preset === "weekly") rule = "RRULE:FREQ=WEEKLY";
  else if (preset === "monthly") {
    const { n, byday } = nthWeekdayOfMonth(start);
    rule = `RRULE:FREQ=MONTHLY;BYDAY=${n}${byday}`;
  } else if (preset === "yearly") rule = "RRULE:FREQ=YEARLY";
  else return undefined;
  if (endMode === "until" && until) {
    rule += `;UNTIL=${until.replaceAll("-", "")}`;
  } else if (endMode === "count" && Number(count) > 0) {
    rule += `;COUNT=${Number(count)}`;
  }
  return [rule];
}

function parsePreset(recurrence: string[] | null | undefined): string {
  const raw = recurrence?.find((r) => r.startsWith("RRULE:")) ?? "";
  if (!raw) return "none";
  if (raw.includes("FREQ=DAILY")) return "daily";
  if (raw.includes("BYDAY=MO,TU,WE,TH,FR")) return "weekdays";
  if (raw.includes("FREQ=WEEKLY")) return "weekly";
  if (raw.includes("FREQ=MONTHLY")) return "monthly";
  if (raw.includes("FREQ=YEARLY")) return "yearly";
  return "none";
}

export type EditorState = {
  open: boolean;
  event?: CalendarEvent | null;
  defaults?: {
    start: DateTime;
    end: DateTime;
    allDay?: boolean;
    calendarId?: string;
  };
};

export function EventEditor({
  state,
  onOpenChange,
  calendars,
  desktop,
  onSaved,
  onDeleted,
  onOpenEvent,
}: {
  state: EditorState;
  onOpenChange: (open: boolean) => void;
  calendars: CalendarItem[];
  desktop: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  onOpenEvent?: (event: CalendarEvent) => void;
}) {
  const event = state.event ?? null;
  const writable = calendars.filter((c) =>
    ["owner", "writer"].includes(c.accessRole ?? ""),
  );
  const calendarOptions = writable.length ? writable : calendars;
  const primary = calendarOptions.find((c) => c.primary) ?? calendarOptions[0];

  const [summary, setSummary] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [timezone, setTimezone] = useState(ZONE);
  const [preset, setPreset] = useState("none");
  const [endMode, setEndMode] = useState("never");
  const [until, setUntil] = useState("");
  const [count, setCount] = useState("10");
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [createMeet, setCreateMeet] = useState(false);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<RecurrenceScope>("this");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [eventType, setEventType] = useState("default");
  const [workLocType, setWorkLocType] = useState("homeOffice");
  const [useDefaultReminders, setUseDefaultReminders] = useState(true);
  const [reminderRows, setReminderRows] = useState<{ method: string; minutes: string }[]>([
    { method: "popup", minutes: "10" },
  ]);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveTitle, setDriveTitle] = useState("");
  const [attachments, setAttachments] = useState<{ fileUrl: string; title?: string; mimeType?: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; summary: string | null }[]>([]);
  const [roomsHint, setRoomsHint] = useState<string | null>(null);
  const [busyHint, setBusyHint] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [findDuration, setFindDuration] = useState<"30" | "60">("30");
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    setConfirmDelete(false);
    if (event) {
      setSummary(event.summary ?? "");
      setCalendarId(event.calendarId);
      setAllDay(event.allDay);
      if (event.allDay && event.allDayStart && event.allDayEnd) {
        setStartDate(event.allDayStart);
        const endEx = DateTime.fromISO(event.allDayEnd);
        setEndDate(endEx.minus({ days: 1 }).toISODate() ?? event.allDayStart);
        setStartTime("09:00");
        setEndTime("10:00");
      } else {
        const s = DateTime.fromISO(event.startAt ?? "", { setZone: true }).setZone(ZONE);
        const e = DateTime.fromISO(event.endAt ?? "", { setZone: true }).setZone(ZONE);
        setStartDate(s.toISODate() ?? "");
        setEndDate(e.toISODate() ?? "");
        setStartTime(s.toFormat("HH:mm"));
        setEndTime(e.toFormat("HH:mm"));
      }
      setTimezone(event.timezone || ZONE);
      setPreset(parsePreset(event.recurrence));
      setAttendees((event.attendees ?? []).map((a) => a.email));
      setLocation(event.location ?? "");
      setCreateMeet(Boolean(event.hangoutLink));
      setDescription(event.description ?? "");
      setScope("this");
      setEventType(event.eventType && event.eventType !== "default" ? event.eventType : "default");
      setUseDefaultReminders(event.reminders?.useDefault !== false);
      setReminderRows(
        event.reminders?.overrides?.length
          ? event.reminders.overrides.map((o) => ({ method: o.method, minutes: String(o.minutes) }))
          : [{ method: "popup", minutes: "10" }],
      );
      setAttachments(event.attachments ?? []);
    } else if (state.defaults) {
      const s = state.defaults.start;
      const e = state.defaults.end;
      setSummary("");
      setCalendarId(state.defaults.calendarId ?? primary?.id ?? "");
      setAllDay(Boolean(state.defaults.allDay));
      setStartDate(s.toISODate() ?? "");
      setEndDate(e.toISODate() ?? "");
      setStartTime(s.toFormat("HH:mm"));
      setEndTime(e.toFormat("HH:mm"));
      setTimezone(ZONE);
      setPreset("none");
      setEndMode("never");
      setAttendees([]);
      setLocation("");
      setCreateMeet(false);
      setDescription("");
      setEventType("default");
      setUseDefaultReminders(true);
      setReminderRows([{ method: "popup", minutes: "10" }]);
      setAttachments([]);
      setSlots([]);
      setBusyHint(null);
    }
  }, [state.open, event, state.defaults, primary?.id]);

  useEffect(() => {
    if (!state.open) return;
    apiClient.rooms().then((res) => {
      setRooms(res.rooms);
      setRoomsHint(res.hint);
    }).catch(() => undefined);
  }, [state.open]);

  const startDt = useMemo(() => {
    if (allDay) return DateTime.fromISO(startDate, { zone: timezone || ZONE });
    return DateTime.fromISO(`${startDate}T${startTime}`, { zone: timezone || ZONE });
  }, [allDay, startDate, startTime, timezone]);

  function addAttendee() {
    const email = attendeeInput.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toast.error("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    if (!attendees.includes(email)) setAttendees((a) => [...a, email]);
    setAttendeeInput("");
  }

  function payload() {
    const start = allDay
      ? startDate
      : startDt.toISO({ suppressMilliseconds: true }) ?? "";
    let end: string;
    if (allDay) {
      end = DateTime.fromISO(endDate).plus({ days: 1 }).toISODate() ?? endDate;
    } else {
      const e = DateTime.fromISO(`${endDate}T${endTime}`, { zone: timezone || ZONE });
      end = e.toISO({ suppressMilliseconds: true }) ?? "";
    }
    return {
      summary: summary.trim() || "Ohne Titel",
      calendarId,
      allDay,
      start,
      end,
      timezone: timezone || ZONE,
      location: location || null,
      description: description || null,
      attendees: attendees.map((email) => {
        const room = rooms.find((r) => r.id === email);
        return room
          ? { email, resource: true, displayName: room.summary ?? email }
          : { email };
      }),
      recurrence: buildRrule(preset, startDt, endMode, until, count),
      createMeet: createMeet && !event?.hangoutLink,
      scope: event?.recurringEventId ? scope : undefined,
      reminders: {
        useDefault: useDefaultReminders,
        overrides: useDefaultReminders
          ? undefined
          : reminderRows
              .map((r) => ({ method: r.method, minutes: Number(r.minutes) }))
              .filter((r) => r.minutes > 0 && (r.method === "popup" || r.method === "email")),
      },
      attachments,
      eventType: eventType === "default" ? undefined : eventType,
      workingLocationProperties:
        eventType === "workingLocation"
          ? workLocType === "customLocation"
            ? { type: "customLocation", customLocation: { label: location || "Unterwegs" } }
            : { type: workLocType }
          : undefined,
      outOfOfficeProperties:
        eventType === "outOfOffice"
          ? { autoDeclineMode: "declineOnlyNewConflictingInvitations" }
          : undefined,
      focusTimeProperties:
        eventType === "focusTime"
          ? { autoDeclineMode: "declineNone", chatStatus: "doNotDisturb" }
          : undefined,
    };
  }

  async function save() {
    setSaving(true);
    try {
      if (event) {
        await apiClient.patchEvent(event.id, payload());
        toast.success("Termin gespeichert.");
      } else {
        await apiClient.createEvent(payload());
        toast.success("Termin erstellt.");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event) return;
    setSaving(true);
    try {
      await apiClient.deleteEvent(event.id, event.recurringEventId ? scope : "this");
      toast.success("Termin gelöscht.");
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function rsvp(status: "accepted" | "tentative" | "declined") {
    if (!event) return;
    try {
      await apiClient.rsvp(event.id, status);
      toast.success(
        status === "accepted"
          ? "Zugesagt."
          : status === "tentative"
            ? "Mit Vorbehalt."
            : "Abgelehnt.",
      );
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Zusage fehlgeschlagen.");
    }
  }

  async function duplicate() {
    setSaving(true);
    try {
      const body = payload();
      const { event: created } = await apiClient.createEvent({
        ...body,
        summary: `Kopie: ${summary.trim() || "Ohne Titel"}`,
        scope: undefined,
      });
      toast.success("Kopie erstellt.");
      onSaved();
      if (created && onOpenEvent) onOpenEvent(created);
      else onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Duplizieren fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function findSlots() {
    setFinding(true);
    try {
      const res = await apiClient.findTime(attendees, findDuration === "60" ? 60 : 30);
      setSlots(res.slots);
      if (!res.slots.length) toast.message("Keine freien Termine in den nächsten Tagen.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Termin finden fehlgeschlagen.");
    } finally {
      setFinding(false);
    }
  }

  async function checkBusy() {
    if (!attendees.length) {
      setBusyHint(null);
      return;
    }
    const start = allDay
      ? DateTime.fromISO(startDate, { zone: timezone || ZONE }).startOf("day")
      : DateTime.fromISO(`${startDate}T${startTime}`, { zone: timezone || ZONE });
    const end = allDay
      ? DateTime.fromISO(endDate, { zone: timezone || ZONE }).plus({ days: 1 })
      : DateTime.fromISO(`${endDate}T${endTime}`, { zone: timezone || ZONE });
    try {
      const res = await apiClient.freeBusy(
        attendees,
        start.toUTC().toISO() ?? "",
        end.toUTC().toISO() ?? "",
      );
      const busy = res.calendars.filter((c) => c.busy.length);
      setBusyHint(
        busy.length
          ? `Belegt: ${busy.map((c) => c.id).join(", ")}`
          : "Alle eingeladenen Personen sind in diesem Zeitraum frei.",
      );
    } catch {
      setBusyHint("Frei/Belegt konnte nicht geprüft werden.");
    }
  }

  function addDrive() {
    const url = driveUrl.trim();
    if (!url) return;
    let fileUrl = url;
    const idMatch = url.match(/[-\w]{25,}/);
    if (!url.startsWith("http") && idMatch) {
      fileUrl = `https://drive.google.com/file/d/${idMatch[0]}/view`;
    }
    setAttachments((a) => [...a, { fileUrl, title: driveTitle.trim() || "Drive-Datei" }]);
    setDriveUrl("");
    setDriveTitle("");
  }

  const form = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Titel</Label>
        <Input id="title" value={summary} onValueChange={setSummary} placeholder="Neuer Termin" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Kalender</Label>
        <Select
          value={calendarId}
          onValueChange={(v) => setCalendarId(String(v ?? ""))}
          items={calendarOptions.map((c) => ({
            value: c.id,
            label: c.summary || "Kalender",
          }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Kalender wählen" />
          </SelectTrigger>
          <SelectContent>
            {calendarOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.summary || "Kalender"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Label htmlFor="allday">Ganztägig</Label>
        <Switch checked={allDay} onCheckedChange={(v) => setAllDay(Boolean(v))} id="allday" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start-date">Start</Label>
          <DateField id="start-date" value={startDate} onValueChange={setStartDate} />
        </div>
        {allDay ? null : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-time">Uhrzeit</Label>
            <TimeField id="start-time" value={startTime} onValueChange={setStartTime} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end-date">Ende</Label>
          <DateField id="end-date" value={endDate} onValueChange={setEndDate} />
        </div>
        {allDay ? null : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-time">Uhrzeit</Label>
            <TimeField id="end-time" value={endTime} onValueChange={setEndTime} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Zeitzone</Label>
        <Select value={timezone} onValueChange={(v) => setTimezone(String(v ?? ZONE))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Wiederholen</Label>
        <Select
          value={preset}
          onValueChange={(v) => setPreset(String(v ?? "none"))}
          items={{
            none: "Nie",
            daily: "Täglich",
            weekdays: "Wochentags",
            weekly: "Wöchentlich",
            monthly: "Monatlich am Wochentag",
            yearly: "Jährlich",
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nie</SelectItem>
            <SelectItem value="daily">Täglich</SelectItem>
            <SelectItem value="weekdays">Wochentags</SelectItem>
            <SelectItem value="weekly">Wöchentlich</SelectItem>
            <SelectItem value="monthly">Monatlich am Wochentag</SelectItem>
            <SelectItem value="yearly">Jährlich</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {preset !== "none" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Endet</Label>
            <Select
              value={endMode}
              onValueChange={(v) => setEndMode(String(v ?? "never"))}
              items={{ never: "Nie", until: "Am Datum", count: "Nach Anzahl" }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Nie</SelectItem>
                <SelectItem value="until">Am Datum</SelectItem>
                <SelectItem value="count">Nach Anzahl</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {endMode === "until" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="until-date">Bis</Label>
              <DateField id="until-date" value={until} onValueChange={setUntil} />
            </div>
          ) : null}
          {endMode === "count" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Termine</Label>
              <Input type="number" min={1} value={count} onValueChange={setCount} />
            </div>
          ) : null}
        </div>
      ) : null}
      {event?.recurringEventId ? (
        <div className="flex flex-col gap-1.5">
          <Label>Dieser Termin</Label>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as RecurrenceScope)}
            items={{
              this: "Nur dieses Ereignis",
              thisAndFollowing: "Dieses und folgende",
              all: "Alle Ereignisse",
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this">Nur dieses Ereignis</SelectItem>
              <SelectItem value="thisAndFollowing">Dieses und folgende</SelectItem>
              <SelectItem value="all">Alle Ereignisse</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attendees">Teilnehmer</Label>
        <div className="flex gap-2">
          <Input
            id="attendees"
            value={attendeeInput}
            onValueChange={setAttendeeInput}
            placeholder="name@example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addAttendee();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addAttendee}>
            Hinzufügen
          </Button>
        </div>
        {attendees.length ? (
          <div className="flex flex-wrap gap-2">
            {attendees.map((email) => {
              const info = event?.attendees?.find((a) => a.email === email);
              const status =
                info?.responseStatus === "accepted"
                  ? "zugesagt"
                  : info?.responseStatus === "declined"
                    ? "abgelehnt"
                    : info?.responseStatus === "tentative"
                      ? "vielleicht"
                      : "";
              return (
                <span
                  key={email}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full bg-muted px-3 text-sm"
                >
                  {email}
                  {status ? <span className="text-muted-foreground">· {status}</span> : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setAttendees((a) => a.filter((x) => x !== email))}
                  >
                    <XIcon className="size-3.5" />
                    <span className="sr-only">Entfernen</span>
                  </Button>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      {attendees.length ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void checkBusy()}>
              Frei/Belegt prüfen
            </Button>
            <Select value={findDuration} onValueChange={(v) => setFindDuration(v === "60" ? "60" : "30")}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 Min.</SelectItem>
                <SelectItem value="60">60 Min.</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => void findSlots()} disabled={finding}>
              {finding ? "Sucht…" : "Termin finden"}
            </Button>
          </div>
          {busyHint ? <p className="text-xs text-muted-foreground">{busyHint}</p> : null}
          {slots.length ? (
            <ul className="flex flex-col gap-1">
              {slots.map((s) => {
                const st = DateTime.fromISO(s.start, { setZone: true }).setLocale("de");
                const en = DateTime.fromISO(s.end, { setZone: true });
                return (
                  <li key={s.start}>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-auto min-h-9 w-full justify-start text-left text-sm"
                      onClick={() => {
                        setAllDay(false);
                        setStartDate(st.toISODate() ?? "");
                        setEndDate(en.toISODate() ?? "");
                        setStartTime(st.toFormat("HH:mm"));
                        setEndTime(en.toFormat("HH:mm"));
                      }}
                    >
                      {st.toFormat("ccc d. LLL, HH:mm")}–{en.toFormat("HH:mm")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
      {rooms.length ? (
        <div className="flex flex-col gap-1.5">
          <Label>Raum</Label>
          <Select
            value="__none"
            onValueChange={(v) => {
              const id = String(v ?? "");
              if (id && id !== "__none" && !attendees.includes(id)) setAttendees((a) => [...a, id]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Raum hinzufügen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Raum wählen</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.summary || r.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : roomsHint ? (
        <p className="text-xs text-muted-foreground">{roomsHint}</p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label>Terminart</Label>
        <Select value={eventType} onValueChange={(v) => setEventType(String(v ?? "default"))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Termin</SelectItem>
            <SelectItem value="focusTime">Fokuszeit</SelectItem>
            <SelectItem value="outOfOffice">Abwesenheit</SelectItem>
            <SelectItem value="workingLocation">Arbeitsort</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {eventType === "workingLocation" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Arbeitsort</Label>
          <Select value={workLocType} onValueChange={(v) => setWorkLocType(String(v ?? "homeOffice"))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="homeOffice">Homeoffice</SelectItem>
              <SelectItem value="officeLocation">Büro</SelectItem>
              <SelectItem value="customLocation">Anderer Ort</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <LocationField id="location" value={location} onValueChange={setLocation} />
      {location ? <EventMapSnippet location={location} summary={summary} /> : null}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Label htmlFor="meet" className="flex items-center gap-2">
          <Video className="size-4" />
          Google Meet
        </Label>
        <Switch
          id="meet"
          checked={createMeet || Boolean(event?.hangoutLink)}
          onCheckedChange={(v) => setCreateMeet(Boolean(v))}
        />
      </div>
      {event?.hangoutLink ? (
        <a
          href={event.hangoutLink}
          className="text-sm text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Meet-Link öffnen
        </a>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Notiz</Label>
        <Textarea
          id="note"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Label htmlFor="def-rem">Kalender-Standarderinnerungen</Label>
        <Switch
          id="def-rem"
          checked={useDefaultReminders}
          onCheckedChange={(v) => setUseDefaultReminders(Boolean(v))}
        />
      </div>
      {!useDefaultReminders ? (
        <div className="flex flex-col gap-2">
          {reminderRows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_auto] gap-2">
              <Select
                value={row.method}
                onValueChange={(v) =>
                  setReminderRows((rows) => rows.map((r, j) => (j === i ? { ...r, method: String(v ?? "popup") } : r)))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popup">Hinweis</SelectItem>
                  <SelectItem value="email">E-Mail</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                value={row.minutes}
                onValueChange={(v) =>
                  setReminderRows((rows) => rows.map((r, j) => (j === i ? { ...r, minutes: v } : r)))
                }
                aria-label="Minuten vorher"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setReminderRows((rows) => rows.filter((_, j) => j !== i))}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setReminderRows((r) => [...r, { method: "popup", minutes: "10" }])}>
              10 Min. Hinweis
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setReminderRows((r) => [...r, { method: "email", minutes: "1440" }])}>
              1 Tag E-Mail
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label>Drive-Anhänge</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={driveUrl} onValueChange={setDriveUrl} placeholder="Drive-URL oder Datei-ID" />
          <Input value={driveTitle} onValueChange={setDriveTitle} placeholder="Dateiname" />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addDrive}>
          <Paperclip className="size-4" />
          Anhängen
        </Button>
        {attachments.length ? (
          <ul className="flex flex-col gap-1">
            {attachments.map((a) => (
              <li key={a.fileUrl} className="flex items-center gap-2 text-sm">
                <a href={a.fileUrl} className="min-w-0 flex-1 truncate text-primary" target="_blank" rel="noreferrer">
                  {a.title || a.fileUrl}
                </a>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setAttachments((xs) => xs.filter((x) => x.fileUrl !== a.fileUrl))}>
                  <XIcon className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {event?.attendees?.some((a) => a.self) ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => rsvp("accepted")}>
            Zusagen
          </Button>
          <Button type="button" variant="secondary" onClick={() => rsvp("tentative")}>
            Vielleicht
          </Button>
          <Button type="button" variant="outline" onClick={() => rsvp("declined")}>
            Ablehnen
          </Button>
        </div>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      {event ? (
        <>
          <Button variant="outline" onClick={() => void duplicate()} disabled={saving}>
            <Copy className="size-4" />
            Duplizieren
          </Button>
          <a href={`/api/events/${event.id}/ics`}>
            <Button variant="outline" type="button">
              <Download className="size-4" />
              ICS
            </Button>
          </a>
        </>
      ) : null}
      {event ? (
        confirmDelete ? (
          <Button variant="destructive" onClick={remove} disabled={saving}>
            Wirklich löschen
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            Löschen
          </Button>
        )
      ) : null}
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Abbrechen
      </Button>
      <Button onClick={save} disabled={saving || !calendarId}>
        Speichern
      </Button>
    </div>
  );

  if (desktop) {
    return (
      <Dialog open={state.open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(90dvh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <EventArtBanner
            variant="header"
            className="h-44 w-full shrink-0 rounded-t-xl"
            summary={summary}
            description={description || event?.description}
            eventType={eventType}
            calendarSummary={event?.calendarSummary}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
            <DialogHeader>
              <DialogTitle>{event ? "Termin bearbeiten" : "Neuer Termin"}</DialogTitle>
              <DialogDescription>Änderungen werden mit Google Calendar synchronisiert.</DialogDescription>
            </DialogHeader>
            <div className="mt-4">{form}</div>
          </div>
          <DialogFooter className="shrink-0 px-4 py-4">{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={state.open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 overflow-hidden p-0">
        <EventArtBanner
          variant="header"
          className="h-44 w-full shrink-0 rounded-t-2xl"
          summary={summary}
          description={description || event?.description}
          eventType={eventType}
          calendarSummary={event?.calendarSummary}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{event ? "Termin bearbeiten" : "Neuer Termin"}</SheetTitle>
            <SheetDescription>Änderungen werden mit Google Calendar synchronisiert.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{form}</div>
        </div>
        <SheetFooter className="shrink-0">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

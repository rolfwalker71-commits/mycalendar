import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Video, XIcon } from "lucide-react";
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
}: {
  state: EditorState;
  onOpenChange: (open: boolean) => void;
  calendars: CalendarItem[];
  desktop: boolean;
  onSaved: () => void;
  onDeleted: () => void;
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
    }
  }, [state.open, event, state.defaults, primary?.id]);

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
      attendees: attendees.map((email) => ({ email })),
      recurrence: buildRrule(preset, startDt, endMode, until, count),
      createMeet: createMeet && !event?.hangoutLink,
      scope: event?.recurringEventId ? scope : undefined,
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="location">Ort</Label>
        <Input id="location" value={location} onValueChange={setLocation} />
      </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{event ? "Termin bearbeiten" : "Neuer Termin"}</DialogTitle>
            <DialogDescription>Änderungen werden mit Google Calendar synchronisiert.</DialogDescription>
          </DialogHeader>
          {form}
          <DialogFooter>{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={state.open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{event ? "Termin bearbeiten" : "Neuer Termin"}</SheetTitle>
          <SheetDescription>Änderungen werden mit Google Calendar synchronisiert.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{form}</div>
        <SheetFooter>{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

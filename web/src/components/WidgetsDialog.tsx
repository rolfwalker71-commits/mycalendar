import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Copy, ExternalLink, KeyRound, LayoutGrid, Mail, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiClient, ApiError } from "@/lib/api";
import { calendarColor } from "@/lib/colors";
import type { CalendarItem } from "@/lib/types";
import {
  buildWidgetScript,
  DEFAULT_WIDGET_CONFIG,
  WIDGET_KINDS,
  type WidgetConfig,
  type WidgetDays,
  type WidgetKind,
  type WidgetSummary,
} from "@/lib/widgets";
import { cn } from "@/lib/utils";

type Draft = { id: string | null; name: string; kind: WidgetKind; config: WidgetConfig };

const KIND_ICON: Record<WidgetKind, typeof CalendarDays> = {
  calendar: CalendarDays,
  mail: Mail,
  day: Sun,
};

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * iOS only allows clipboard writes inside the tap. ClipboardItem accepts a promise,
 * so the script can be fetched after the tap without losing that permission.
 */
async function copyText(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) }),
      ]);
      return;
    } catch {
      /* fall through */
    }
  }
  await navigator.clipboard.writeText(await text);
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="rounded-full bg-muted p-0.5">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={cn(
              "min-h-9 rounded-full px-2 text-sm font-medium leading-tight",
              value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  title,
  hint,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
      <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal leading-snug">
        <span className="block font-medium">{title}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border rounded-2xl bg-muted/60">{children}</div>
    </section>
  );
}

function lastUsed(value: string | null): string {
  if (!value) return "Noch nie abgerufen";
  const date = new Date(value);
  return `Zuletzt abgerufen ${date.toLocaleString("de-DE", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function WidgetsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      return;
    }
    setLoading(true);
    Promise.all([apiClient.widgets(), apiClient.calendars()])
      .then(([w, c]) => {
        setWidgets(w.widgets);
        setCalendars(c.calendars);
      })
      .catch((err) => toast.error(errorText(err, "Widgets konnten nicht geladen werden.")))
      .finally(() => setLoading(false));
  }, [open]);

  const calendarNames = useMemo(() => new Map(calendars.map((c) => [c.id, c.summary || "Kalender"])), [calendars]);

  function scriptFor(widget: WidgetSummary, token?: string): Promise<string> {
    const tokenPromise = token ? Promise.resolve(token) : apiClient.widgetToken(widget.id).then((r) => r.token);
    return tokenPromise.then((t) =>
      buildWidgetScript({ appUrl: window.location.origin, token: t, name: widget.name }),
    );
  }

  /** Call synchronously from the tap: the clipboard write must start before any await. */
  async function copyFrom(script: Promise<string>) {
    try {
      await copyText(script);
      toast.success("Skript kopiert. Jetzt in Scriptable einfügen.");
    } catch (err) {
      toast.error(errorText(err, "Kopieren nicht möglich. Bitte „Skript kopieren“ antippen."));
    }
  }

  function copyScript(widget: WidgetSummary) {
    return copyFrom(scriptFor(widget));
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const body = { name: draft.name.trim() || "Widget", kind: draft.kind, config: draft.config };
      if (draft.id) {
        const { widget } = await apiClient.updateWidget(draft.id, body);
        setWidgets((ws) => ws.map((w) => (w.id === widget.id ? widget : w)));
        toast.success("Gespeichert. Das Widget übernimmt es beim nächsten Aktualisieren.");
        setDraft(null);
      } else {
        const created = apiClient.createWidget(body);
        const copying = copyFrom(created.then(({ widget, token }) => scriptFor(widget, token)));
        const { widget } = await created;
        setWidgets((ws) => [...ws, widget]);
        setDraft({ id: widget.id, name: widget.name, kind: widget.kind, config: widget.config });
        await copying;
      }
    } catch (err) {
      toast.error(errorText(err, "Speichern fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(widget: Draft) {
    if (!widget.id) return;
    if (!window.confirm(`„${widget.name}“ löschen? Das Widget auf dem Home-Bildschirm zeigt danach nichts mehr an.`)) return;
    try {
      await apiClient.deleteWidget(widget.id);
      setWidgets((ws) => ws.filter((w) => w.id !== widget.id));
      setDraft(null);
      toast.success("Widget gelöscht.");
    } catch (err) {
      toast.error(errorText(err, "Löschen fehlgeschlagen."));
    }
  }

  async function rotate(widget: Draft) {
    if (!widget.id) return;
    if (!window.confirm("Neuen Schlüssel erzeugen? Das bisherige Skript funktioniert danach nicht mehr und muss neu eingefügt werden.")) return;
    try {
      const rotated = apiClient.rotateWidgetToken(widget.id);
      const copying = copyFrom(rotated.then(({ widget: next, token }) => scriptFor(next, token)));
      const { widget: next } = await rotated;
      setWidgets((ws) => ws.map((w) => (w.id === next.id ? next : w)));
      await copying;
    } catch (err) {
      toast.error(errorText(err, "Schlüssel konnte nicht erneuert werden."));
    }
  }

  function patchConfig(partial: Partial<WidgetConfig>) {
    setDraft((d) => (d ? { ...d, config: { ...d.config, ...partial } } : d));
  }

  const allCalendars = draft ? draft.config.calendarIds.length === 0 : true;

  function toggleCalendar(id: string, on: boolean) {
    if (!draft) return;
    const current = draft.config.calendarIds.length
      ? draft.config.calendarIds
      : calendars.filter((c) => c.selected).map((c) => c.id);
    const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
    patchConfig({ calendarIds: next.length ? next : [id] });
  }

  const editor = draft ? (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="widget-name">Name</Label>
        <Input
          id="widget-name"
          value={draft.name}
          maxLength={60}
          placeholder="Familie und ich"
          onValueChange={(v) => setDraft((d) => (d ? { ...d, name: v } : d))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Inhalt</Label>
        <Segmented
          label="Widget-Typ"
          value={draft.kind}
          options={WIDGET_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          onChange={(kind) => setDraft((d) => (d ? { ...d, kind } : d))}
        />
        <p className="px-1 text-xs text-muted-foreground">
          {WIDGET_KINDS.find((k) => k.value === draft.kind)?.hint}. Jede Größe möglich, auch Sperrbildschirm.
        </p>
      </div>

      {draft.kind !== "mail" ? (
        <>
          <Group title="Kalender anzeigen">
            <ToggleRow
              id="widget-all-calendars"
              title="Wie in der App"
              hint="Alle Kalender, die in der App eingeblendet sind"
              checked={allCalendars}
              onChange={(on) =>
                patchConfig({
                  calendarIds: on ? [] : calendars.filter((c) => c.selected).map((c) => c.id),
                })
              }
            />
            {!allCalendars
              ? calendars.map((cal) => (
                  <label
                    key={cal.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-3"
                  >
                    <Checkbox
                      checked={draft.config.calendarIds.includes(cal.id)}
                      onCheckedChange={(v) => toggleCalendar(cal.id, v === true)}
                    />
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: calendarColor(cal.backgroundColor) }}
                    />
                    <span className="min-w-0 flex-1 text-sm leading-snug break-words">
                      {cal.summary || "Kalender"}
                    </span>
                  </label>
                ))
              : null}
          </Group>
          <Group title="Darstellung">
            <ToggleRow
              id="widget-art"
              title="Kalendergrafiken"
              hint="Bilder wie in der Agenda der App"
              checked={draft.config.showArt}
              onChange={(v) => patchConfig({ showArt: v })}
            />
            <ToggleRow
              id="widget-allday"
              title="Ganztägige Termine"
              checked={draft.config.showAllDay}
              onChange={(v) => patchConfig({ showAllDay: v })}
            />
            <ToggleRow
              id="widget-declined"
              title="Abgelehnte ausblenden"
              checked={draft.config.hideDeclined}
              onChange={(v) => patchConfig({ hideDeclined: v })}
            />
          </Group>
          <div className="flex flex-col gap-1.5">
            <Label>Zeitraum im großen Widget</Label>
            <Segmented<WidgetDays>
              label="Zeitraum"
              value={draft.config.days}
              options={[
                { value: 1, label: "1 Tag" },
                { value: 3, label: "3 Tage" },
                { value: 7, label: "7 Tage" },
              ]}
              onChange={(days) => patchConfig({ days })}
            />
          </div>
        </>
      ) : null}

      {draft.kind !== "calendar" ? (
        <Group title="Mail">
          <ToggleRow
            id="widget-mail-preview"
            title="Absender und Betreff zeigen"
            hint="Aus: nur die Zahl der ungelesenen Mails, z. B. für den Sperrbildschirm"
            checked={draft.config.mailPreview}
            onChange={(v) => patchConfig({ mailPreview: v })}
          />
        </Group>
      ) : null}

      {draft.kind === "day" ? (
        <Group title="Aufgaben">
          <ToggleRow
            id="widget-tasks"
            title="Offene Aufgaben"
            hint="Google Tasks, nach Fälligkeit"
            checked={draft.config.showTasks}
            onChange={(v) => patchConfig({ showTasks: v })}
          />
        </Group>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => void save()}>
          {draft.id ? "Speichern" : "Widget anlegen und Skript kopieren"}
        </Button>
        {draft.id ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                const w = widgets.find((x) => x.id === draft.id);
                if (w) void copyScript(w);
              }}
            >
              <Copy className="size-4" />
              Skript kopieren
            </Button>
            <a href="scriptable:///add" className="contents">
              <Button variant="outline" className="w-full">
                <ExternalLink className="size-4" />
                Scriptable öffnen
              </Button>
            </a>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => void rotate(draft)}>
                <KeyRound className="size-4" />
                Neuer Schlüssel
              </Button>
              <Button variant="destructive" onClick={() => void remove(draft)}>
                <Trash2 className="size-4" />
                Löschen
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  ) : null;

  const list = (
    <div className="flex min-w-0 flex-col gap-4">
      <ol className="flex flex-col gap-1.5 rounded-2xl bg-muted/60 p-3 text-sm leading-snug">
        <li>
          <span className="font-medium">1.</span> <a className="text-primary underline-offset-2 hover:underline" href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noreferrer">Scriptable</a> aus dem App Store laden.
        </li>
        <li>
          <span className="font-medium">2.</span> Hier ein Widget anlegen. Das Skript wird automatisch kopiert.
        </li>
        <li>
          <span className="font-medium">3.</span> In Scriptable auf <span className="font-medium">+</span> tippen, einfügen und benennen.
        </li>
        <li>
          <span className="font-medium">4.</span> Home-Bildschirm lange drücken › <span className="font-medium">+</span> › Scriptable, Größe wählen, dann im Widget unter „Script“ das Skript auswählen.
        </li>
      </ol>

      {loading ? <p className="text-sm text-muted-foreground">Laden…</p> : null}
      {!loading && widgets.length ? (
        <ul className="flex flex-col gap-2">
          {widgets.map((w) => {
            const Icon = KIND_ICON[w.kind];
            const cals = w.config.calendarIds.length
              ? w.config.calendarIds.map((id) => calendarNames.get(id)).filter(Boolean).join(", ")
              : "Kalender wie in der App";
            return (
              <li key={w.id} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
                  <Icon className="size-5" />
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setDraft({ id: w.id, name: w.name, kind: w.kind, config: w.config })}
                >
                  <span className="block truncate font-medium">{w.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {w.kind === "mail"
                      ? w.config.mailPreview
                        ? "Ungelesene, Absender und Betreff"
                        : "Nur Zahl der ungelesenen Mails"
                      : cals}
                  </span>
                  <span className="block text-xs text-muted-foreground">{lastUsed(w.lastUsedAt)}</span>
                </button>
                <Button variant="ghost" size="icon" aria-label={`Skript für ${w.name} kopieren`} onClick={() => void copyScript(w)}>
                  <Copy className="size-5" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!loading && !widgets.length ? (
        <p className="px-1 text-sm text-muted-foreground">
          Noch keine Widgets. Lege eines an, z. B. „Kalender“ für den Home-Bildschirm.
        </p>
      ) : null}

      <Button
        onClick={() =>
          setDraft({
            id: null,
            name: widgets.length ? `Widget ${widgets.length + 1}` : "Kalender",
            kind: "calendar",
            config: { ...DEFAULT_WIDGET_CONFIG },
          })
        }
      >
        <Plus className="size-4" />
        Neues Widget
      </Button>
      <p className="px-1 text-xs text-muted-foreground">
        Jedes Widget hat einen eigenen Schlüssel, der nur lesen darf. Löschen oder „Neuer Schlüssel“ sperrt ein kopiertes Skript sofort. Aktualisierung: iOS lädt Widgets etwa alle 15–30 Minuten neu.
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft ? (
              <Button variant="ghost" size="icon" className="-my-2 -ml-2" aria-label="Zurück" onClick={() => setDraft(null)}>
                <ArrowLeft className="size-5" />
              </Button>
            ) : (
              <LayoutGrid className="size-5 text-primary" />
            )}
            {draft ? (draft.id ? draft.name : "Neues Widget") : "Widgets (Scriptable)"}
          </DialogTitle>
          <DialogDescription>
            {draft
              ? "Änderungen gelten ohne neues Einfügen des Skripts."
              : "Eigene Widgets für Home-Bildschirm und Sperrbildschirm auf iPhone und iPad."}
          </DialogDescription>
        </DialogHeader>
        {draft ? editor : list}
      </DialogContent>
    </Dialog>
  );
}

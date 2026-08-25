import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiClient, ApiError } from "@/lib/api";
import {
  disablePush,
  enablePush,
  getExistingSubscription,
  pushSupported,
} from "@/lib/push";
import type { Me } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  fontScalePercent,
  persistFontScale,
  readFontScale,
} from "@/lib/fontScale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/DateTimeFields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function Row({
  id,
  title,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
      <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  me,
  onMeChange,
  threaded,
  onThreadedChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: Me;
  onMeChange: (next: Me) => void;
  threaded: boolean;
  onThreadedChange: (next: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const [fontScale, setFontScale] = useState(readFontScale);
  const supported = pushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vacationOn, setVacationOn] = useState(false);
  const [vacationSubject, setVacationSubject] = useState("");
  const [vacationBody, setVacationBody] = useState("");
  const [vacationStart, setVacationStart] = useState("");
  const [vacationEnd, setVacationEnd] = useState("");
  const [restrictContacts, setRestrictContacts] = useState(false);
  const [restrictDomain, setRestrictDomain] = useState(false);
  const [signature, setSignature] = useState("");
  const [aliasEmail, setAliasEmail] = useState(me.email);
  const [filters, setFilters] = useState<{ id?: string | null; criteria: Record<string, unknown>; action: Record<string, unknown> }[]>([]);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterAction, setFilterAction] = useState("skip");
  const [mailErr, setMailErr] = useState<string | null>(null);
  const [calNote, setCalNote] = useState<string | null>(null);
  const [whEnabled, setWhEnabled] = useState(Boolean(me.workingHours?.enabled));
  const [whStart, setWhStart] = useState(me.workingHours?.days?.mon?.start ?? "09:00");
  const [whEnd, setWhEnd] = useState(me.workingHours?.days?.mon?.end ?? "17:00");
  const denied =
    supported && typeof Notification !== "undefined" && Notification.permission === "denied";

  useEffect(() => {
    if (!open) return;
    setFontScale(readFontScale());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    getExistingSubscription()
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
    apiClient.mailVacation()
      .then((v) => {
        setVacationOn(v.enableAutoReply);
        setVacationSubject(v.responseSubject);
        setVacationBody(v.responseBodyHtml || v.responseBodyPlainText);
        setRestrictContacts(v.restrictToContacts);
        setRestrictDomain(v.restrictToDomain);
        setMailErr(null);
      })
      .catch((err) => {
        setMailErr(err instanceof ApiError ? err.message : "Gmail-Einstellungen nicht verfügbar.");
      });
    apiClient.mailSendAs()
      .then((res) => {
        const def = res.aliases.find((a) => a.isDefault) ?? res.aliases[0];
        if (def) {
          setAliasEmail(def.sendAsEmail);
          setSignature(def.signature);
        }
      })
      .catch(() => undefined);
    apiClient.mailFilters()
      .then((res) => setFilters(res.filters))
      .catch(() => undefined);
    apiClient.calendarSettings()
      .then((res) => setCalNote(res.note))
      .catch((err) => {
        setCalNote(err instanceof Error ? err.message : null);
      });
  }, [open]);

  async function onPushToggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const ok = await enablePush();
        setSubscribed(ok);
        if (!ok) toast.error("Benachrichtigungen wurden nicht erlaubt.");
        else toast.success("Benachrichtigungen aktiv.");
      } else {
        await disablePush();
        setSubscribed(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Push konnte nicht eingerichtet werden.");
    } finally {
      setBusy(false);
    }
  }

  async function patchFlags(
    partial: {
      notifyCalendar?: boolean;
      notifyMail?: boolean;
      hideDeclined?: boolean;
      secondTimezone?: string | null;
      workingHours?: { enabled: boolean; days: Record<string, { start: string; end: string } | null> };
    },
  ) {
    const next = await apiClient.patchMe(partial);
    onMeChange(next);
  }

  async function sendTest() {
    setBusy(true);
    try {
      if (!subscribed) {
        const ok = await enablePush();
        setSubscribed(ok);
        if (!ok) {
          toast.error("Bitte zuerst Benachrichtigungen erlauben.");
          return;
        }
      }
      const res = await apiClient.pushTest();
      if (!res.sent) toast.message("Gesendet — falls nichts erscheint, Abo prüfen.");
      else toast.success("Testbenachrichtigung gesendet.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Einstellungen</DialogTitle>
          <DialogDescription className="sr-only">App-Einstellungen</DialogDescription>
        </DialogHeader>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Darstellung
          </h2>
          <div className="rounded-full bg-muted p-0.5">
            <div className="grid grid-cols-3 gap-0.5">
              {(
                [
                  ["light", "Hell"],
                  ["dark", "Dunkel"],
                  ["system", "System"],
                ] as [Theme, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "h-8 rounded-full text-sm font-medium leading-none",
                    theme === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="font-scale">Schriftgröße</Label>
              <span className="text-sm tabular-nums text-muted-foreground">{fontScalePercent(fontScale)}</span>
            </div>
            <input
              id="font-scale"
              type="range"
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={FONT_SCALE_STEP}
              value={fontScale}
              className="w-full accent-foreground"
              onChange={(e) => {
                const next = Number(e.target.value);
                setFontScale(next);
                persistFontScale(next);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Listen, Termine, Mails und Kontakte skalieren mit — gilt sofort.
            </p>
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Benachrichtigungen
          </h2>
          {!supported ? (
            <p className="text-xs text-muted-foreground">
              Dieser Browser unterstützt keine Web-Push-Benachrichtigungen.
            </p>
          ) : denied ? (
            <p className="text-xs text-muted-foreground">
              Benachrichtigungen sind blockiert. In den Browser-Einstellungen für diese Seite
              erlauben.
            </p>
          ) : null}
          <Row
            id="push-enabled"
            title="Push-Benachrichtigungen"
            hint="Auf diesem Gerät anzeigen. Am iPhone: App zum Home-Bildschirm hinzufügen."
            checked={subscribed}
            disabled={!supported || denied || busy}
            onCheckedChange={(v) => void onPushToggle(v)}
          />
          <Row
            id="notify-calendar"
            title="Kalender"
            hint="15 Minuten vorher, zum Beginn, ganztägige Termine morgens, neue Einträge"
            checked={me.notifyCalendar}
            disabled={busy}
            onCheckedChange={(v) => void patchFlags({ notifyCalendar: v })}
          />
          <Row
            id="notify-mail"
            title="Neue Mails"
            hint="Absender, Betreff, Vorschau und Bild, sobald eine Nachricht ankommt"
            checked={me.notifyMail}
            disabled={busy}
            onCheckedChange={(v) => void patchFlags({ notifyMail: v })}
          />
          <Button variant="outline" disabled={!supported || busy} onClick={() => void sendTest()}>
            Testbenachrichtigung
          </Button>
        </section>
        <section className="flex flex-col gap-1">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mail</h2>
          <Row
            id="mail-threaded"
            title="Unterhaltungen gruppieren"
            hint="Antworten als Thread; neueste Nachricht oben. Aus = einzelne Mails."
            checked={threaded}
            onCheckedChange={onThreadedChange}
          />
          <p className="px-1 pt-1 text-xs text-muted-foreground">
            {me.geminiAvailable
              ? "Gemini-Zusammenfassungen sind aktiv. Die fertigen Gmail-KI-Übersichten stellt Google nicht per Schnittstelle bereit — hier entstehen eigene."
              : "Gmail-Gemini-Übersichten sind per API nicht lesbar. Für eigene Zusammenfassungen GEMINI_API_KEY in der .env setzen."}
          </p>
          {mailErr ? <p className="text-xs text-destructive">{mailErr}</p> : null}
          <div className="flex flex-col gap-2 pt-2">
            <Label>Signatur (HTML)</Label>
            <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={3} />
            <Button
              variant="outline"
              onClick={() =>
                apiClient
                  .mailSaveSignature(aliasEmail, signature)
                  .then(() => toast.success("Signatur gespeichert."))
                  .catch((err) => toast.error(err instanceof ApiError ? err.message : "Signatur fehlgeschlagen."))
              }
            >
              Signatur speichern
            </Button>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Row
              id="vacation"
              title="Abwesenheitsnotiz"
              hint="Automatische Antwort über Gmail-Einstellungen"
              checked={vacationOn}
              onCheckedChange={setVacationOn}
            />
            <Input value={vacationSubject} onValueChange={setVacationSubject} placeholder="Betreff" />
            <Textarea value={vacationBody} onChange={(e) => setVacationBody(e.target.value)} rows={3} placeholder="Text" />
            <div className="grid grid-cols-2 gap-2">
              <DateField value={vacationStart} onValueChange={setVacationStart} />
              <DateField value={vacationEnd} onValueChange={setVacationEnd} />
            </div>
            <Row
              id="vac-contacts"
              title="Nur Kontakte"
              hint="Antwort nur an Personen im Adressbuch"
              checked={restrictContacts}
              onCheckedChange={setRestrictContacts}
            />
            <Row
              id="vac-domain"
              title="Nur eigene Domain"
              hint="Antwort nur innerhalb der Workspace-Domain"
              checked={restrictDomain}
              onCheckedChange={setRestrictDomain}
            />
            <Button
              variant="outline"
              onClick={() =>
                apiClient
                  .mailSaveVacation({
                    enableAutoReply: vacationOn,
                    responseSubject: vacationSubject,
                    responseBodyHtml: vacationBody,
                    restrictToContacts: restrictContacts,
                    restrictToDomain: restrictDomain,
                    startTime: vacationStart ? String(Date.parse(`${vacationStart}T00:00:00`)) : undefined,
                    endTime: vacationEnd ? String(Date.parse(`${vacationEnd}T23:59:59`)) : undefined,
                  })
                  .then(() => toast.success("Abwesenheit gespeichert."))
                  .catch((err) => toast.error(err instanceof ApiError ? err.message : "Speichern fehlgeschlagen."))
              }
            >
              Abwesenheit speichern
            </Button>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <h3 className="text-sm font-medium">Filter</h3>
            <Input value={filterFrom} onValueChange={setFilterFrom} placeholder="Von (E-Mail)" />
            <Input value={filterQuery} onValueChange={setFilterQuery} placeholder="Suche / query" />
            <Select value={filterAction} onValueChange={(v) => setFilterAction(String(v ?? "skip"))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Posteingang überspringen</SelectItem>
                <SelectItem value="star">Markieren</SelectItem>
                <SelectItem value="trash">In den Papierkorb</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                const action =
                  filterAction === "star"
                    ? { addLabelIds: ["STARRED"] }
                    : filterAction === "trash"
                      ? { addLabelIds: ["TRASH"] }
                      : { removeLabelIds: ["INBOX"] };
                apiClient
                  .mailCreateFilter({ from: filterFrom, query: filterQuery, ...action })
                  .then(() => apiClient.mailFilters())
                  .then((res) => {
                    setFilters(res.filters);
                    toast.success("Filter erstellt.");
                  })
                  .catch((err) => toast.error(err instanceof ApiError ? err.message : "Filter fehlgeschlagen."));
              }}
            >
              Filter anlegen
            </Button>
            <ul className="flex flex-col gap-1 text-xs">
              {filters.map((f) => (
                <li key={f.id ?? JSON.stringify(f.criteria)} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2 py-1">
                  <span className="min-w-0 truncate">
                    {String(f.criteria.from ?? f.criteria.query ?? "Filter")}
                  </span>
                  {f.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        apiClient
                          .mailDeleteFilter(f.id!)
                          .then(() => setFilters((xs) => xs.filter((x) => x.id !== f.id)))
                          .catch((err) => toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen."))
                      }
                    >
                      Löschen
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kalender</h2>
          <Row
            id="hide-declined"
            title="Abgelehnte Termine ausblenden"
            hint="Termine, die du abgelehnt hast, nicht anzeigen"
            checked={me.hideDeclined}
            onCheckedChange={(v) => void patchFlags({ hideDeclined: v })}
          />
          <div className="flex flex-col gap-1.5">
            <Label>Zweite Zeitzone (Tag/Woche)</Label>
            <Select
              value={me.secondTimezone || "none"}
              onValueChange={(v) =>
                void patchFlags({ secondTimezone: v === "none" ? null : String(v) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="Europe/London">Europe/London</SelectItem>
                <SelectItem value="America/New_York">America/New_York</SelectItem>
                <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Row
            id="wh"
            title="Arbeitszeiten in der App anzeigen"
            hint="Schattierung außerhalb der Kernzeit"
            checked={whEnabled}
            onCheckedChange={setWhEnabled}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input type="time" value={whStart} onValueChange={setWhStart} aria-label="Arbeitsbeginn" />
            <Input type="time" value={whEnd} onValueChange={setWhEnd} aria-label="Arbeitsende" />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const days = {
                mon: { start: whStart, end: whEnd },
                tue: { start: whStart, end: whEnd },
                wed: { start: whStart, end: whEnd },
                thu: { start: whStart, end: whEnd },
                fri: { start: whStart, end: whEnd },
                sat: null,
                sun: null,
              };
              void patchFlags({
                workingHours: { enabled: whEnabled, days },
              }).then(() => toast.success("Arbeitszeiten gespeichert."));
            }}
          >
            Arbeitszeiten speichern
          </Button>
          {calNote ? <p className="text-xs text-muted-foreground">{calNote}</p> : null}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Microsoft 365</h2>
          {me.msConnected ? (
            <>
              <p className="text-xs text-muted-foreground">
                Verbunden als {me.msEmail || "Microsoft-Konto"}. Kalender, To Do und Planner werden mitgeladen.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  void apiClient
                    .disconnectMicrosoft()
                    .then(() => {
                      onMeChange({ ...me, msConnected: false, msEmail: null });
                      toast.success("Microsoft getrennt.");
                    })
                    .catch((err) =>
                      toast.error(err instanceof ApiError ? err.message : "Trennen fehlgeschlagen."),
                    );
                }}
              >
                Microsoft trennen
              </Button>
            </>
          ) : me.msConfigured ? (
            <>
              <p className="text-xs text-muted-foreground">
                Geschäftskalender, Planner und To Do für freigeschaltete Konten (z. B. an-group.one).
              </p>
              <a href="/api/auth/microsoft">
                <Button className="w-full bg-[#0078D4] text-white hover:bg-[#006cbe]">Microsoft verbinden</Button>
              </a>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nicht konfiguriert. In der <code>.env</code> MS_CLIENT_ID, MS_CLIENT_SECRET und ALLOWED_MS_EMAILS setzen.
            </p>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Google</h2>
          <p className="text-xs text-muted-foreground">
            Nach neuen Berechtigungen (Kontakte, Aufgaben, Gmail-Einstellungen) bitte neu anmelden. In der Cloud Console ggf. People API, Tasks API und Gmail API aktivieren.
          </p>
          <a href="/api/auth/google">
            <Button className="w-full">Google erneut verbinden</Button>
          </a>
        </section>
      </DialogContent>
    </Dialog>
  );
}

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
import { apiClient } from "@/lib/api";
import {
  disablePush,
  enablePush,
  getExistingSubscription,
  pushSupported,
} from "@/lib/push";
import type { Me } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

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
  const supported = pushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const denied =
    supported && typeof Notification !== "undefined" && Notification.permission === "denied";

  useEffect(() => {
    if (!open) return;
    getExistingSubscription()
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
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

  async function patchFlags(partial: Partial<Pick<Me, "notifyCalendar" | "notifyMail">>) {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Einstellungen</DialogTitle>
          <DialogDescription className="sr-only">App-Einstellungen</DialogDescription>
        </DialogHeader>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Darstellung
          </h2>
          <div className="rounded-xl bg-muted/60 p-1">
            <div className="grid grid-cols-3 gap-1">
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
                    "h-10 rounded-lg text-sm font-medium",
                    theme === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </button>
              ))}
            </div>
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
            hint="Antworten zur selben Nachricht als Thread anzeigen"
            checked={threaded}
            onCheckedChange={onThreadedChange}
          />
          <p className="px-1 pt-1 text-xs text-muted-foreground">
            {me.geminiAvailable
              ? "Gemini-Zusammenfassungen sind aktiv. Die fertigen Gmail-KI-Übersichten stellt Google nicht per Schnittstelle bereit — hier entstehen eigene."
              : "Gmail-Gemini-Übersichten sind per API nicht lesbar. Für eigene Zusammenfassungen GEMINI_API_KEY in der .env setzen."}
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}

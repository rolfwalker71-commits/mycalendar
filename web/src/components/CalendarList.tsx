import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api";
import { calendarColor } from "@/lib/colors";
import type { CalendarItem } from "@/lib/types";

export function CalendarList({
  calendars,
  onToggle,
  onFeedsChanged,
}: {
  calendars: CalendarItem[];
  onToggle: (id: string, selected: boolean) => void;
  onFeedsChanged?: () => void;
}) {
  const mine = calendars.filter((c) => (c.accessRole === "owner" || c.primary) && c.source !== "ics");
  const ics = calendars.filter((c) => c.source === "ics" || c.googleCalId.startsWith("ics:"));
  const other = calendars.filter((c) => !mine.includes(c) && !ics.includes(c));
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [feeds, setFeeds] = useState<{ id: string; url: string; name: string | null }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiClient
      .icsFeeds()
      .then((res) => setFeeds(res.feeds))
      .catch(() => undefined);
  }, [calendars.length]);

  async function subscribe() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await apiClient.subscribeIcs(url.trim(), name.trim() || undefined);
      setUrl("");
      setName("");
      const res = await apiClient.icsFeeds();
      setFeeds(res.feeds);
      onFeedsChanged?.();
      toast.success("Kalender abonniert.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Feed konnte nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  }

  function Group({ items }: { items: CalendarItem[] }) {
    return (
      <ul className="flex flex-col gap-1">
        {items.map((cal) => (
          <li key={cal.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 hover:bg-muted">
              <Checkbox
                checked={cal.selected}
                onCheckedChange={(v) => onToggle(cal.id, v === true)}
              />
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: calendarColor(cal.backgroundColor) }}
              />
              <span className="min-w-0 flex-1 text-sm leading-snug break-words">
                {cal.summary || "Kalender"}
              </span>
            </label>
          </li>
        ))}
      </ul>
    );
  }

  if (!calendars.length) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Noch keine Kalender. Nach der Anmeldung werden sie geladen.
      </p>
    );
  }

  return (
    <Accordion multiple defaultValue={["mine", "other", "ics"]}>
      <AccordionItem value="mine">
        <AccordionTrigger>Meine Kalender</AccordionTrigger>
        <AccordionContent>
          <Group items={mine.length ? mine : calendars.filter((c) => c.source !== "ics")} />
        </AccordionContent>
      </AccordionItem>
      {other.length ? (
        <AccordionItem value="other">
          <AccordionTrigger>Weitere</AccordionTrigger>
          <AccordionContent>
            <Group items={other} />
          </AccordionContent>
        </AccordionItem>
      ) : null}
      <AccordionItem value="ics">
        <AccordionTrigger>ICS-Abos</AccordionTrigger>
        <AccordionContent>
          {ics.length ? <Group items={ics} /> : null}
          <div className="mt-2 flex flex-col gap-2 px-1">
            <Input value={url} onValueChange={setUrl} placeholder="https://…/kalender.ics" aria-label="ICS-Adresse" />
            <Input value={name} onValueChange={setName} placeholder="Name (optional)" aria-label="Kalendername" />
            <Button type="button" variant="outline" disabled={busy || !url.trim()} onClick={() => void subscribe()}>
              <Plus className="size-4" />
              Abonnieren
            </Button>
          </div>
          {feeds.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {feeds.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{f.name || f.url}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Abo entfernen"
                    onClick={() =>
                      void apiClient.deleteIcsFeed(f.id).then(() => {
                        setFeeds((xs) => xs.filter((x) => x.id !== f.id));
                        onFeedsChanged?.();
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

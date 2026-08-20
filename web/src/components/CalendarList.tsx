import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { calendarColor } from "@/lib/colors";
import type { CalendarItem } from "@/lib/types";

export function CalendarList({
  calendars,
  onToggle,
}: {
  calendars: CalendarItem[];
  onToggle: (id: string, selected: boolean) => void;
}) {
  const mine = calendars.filter((c) => c.accessRole === "owner" || c.primary);
  const other = calendars.filter((c) => !mine.includes(c));

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
    <Accordion multiple defaultValue={["mine", "other"]}>
      <AccordionItem value="mine">
        <AccordionTrigger>Meine Kalender</AccordionTrigger>
        <AccordionContent>
          <Group items={mine.length ? mine : calendars} />
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
    </Accordion>
  );
}

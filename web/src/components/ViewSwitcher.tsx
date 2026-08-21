import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ViewId } from "@/lib/types";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "day", label: "Tag" },
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "year", label: "Jahr" },
];

export function ViewSwitcher({
  value,
  onChange,
  withAgenda,
}: {
  value: ViewId;
  onChange: (v: ViewId) => void;
  withAgenda?: boolean;
}) {
  const items = withAgenda ? [...VIEWS, { id: "agenda" as const, label: "Agenda" }] : VIEWS;
  const current = !withAgenda && value === "agenda" ? "month" : value;
  return (
    <Tabs value={current} onValueChange={(v) => onChange(v as ViewId)}>
      <TabsList className="h-14 min-h-14 w-full max-w-xl rounded-full bg-muted p-1.5 group-data-horizontal/tabs:h-14">
        {items.map((v) => (
          <TabsTrigger
            key={v.id}
            value={v.id}
            className="h-full min-h-0 max-h-full items-center rounded-full px-2.5 py-0 leading-none data-active:bg-background data-active:shadow-sm sm:px-3"
          >
            {v.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

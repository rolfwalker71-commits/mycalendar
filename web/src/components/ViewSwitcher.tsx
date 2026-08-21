import { Calendar, CalendarDays, CalendarRange, LayoutGrid, List } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ViewId } from "@/lib/types";

const VIEWS: { id: ViewId; label: string; icon: typeof Calendar }[] = [
  { id: "day", label: "Tag", icon: Calendar },
  { id: "week", label: "Woche", icon: CalendarRange },
  { id: "month", label: "Monat", icon: CalendarDays },
  { id: "year", label: "Jahr", icon: LayoutGrid },
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
  const items = withAgenda
    ? [...VIEWS, { id: "agenda" as const, label: "Agenda", icon: List }]
    : VIEWS;
  const current = !withAgenda && value === "agenda" ? "month" : value;
  return (
    <Tabs value={current} onValueChange={(v) => onChange(v as ViewId)}>
      <TabsList className="w-full max-w-xl">
        {items.map((v) => {
          const Icon = v.icon;
          return (
            <TabsTrigger key={v.id} value={v.id}>
              <Icon />
              {v.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

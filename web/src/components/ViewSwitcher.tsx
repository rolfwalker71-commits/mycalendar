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
      <TabsList className="w-full max-w-xl">
        {items.map((v) => (
          <TabsTrigger key={v.id} value={v.id}>
            {v.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

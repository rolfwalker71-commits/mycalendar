import { CalendarDays, ListTodo, MoreHorizontal, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MobileTab } from "@/lib/types";

const ITEMS: { id: MobileTab; label: string; icon: typeof Sun }[] = [
  { id: "today", label: "Agenda", icon: Sun },
  { id: "calendar", label: "Kalender", icon: CalendarDays },
  { id: "tasks", label: "Aufgaben", icon: ListTodo },
  { id: "search", label: "Suche", icon: Search },
  { id: "more", label: "Mehr", icon: MoreHorizontal },
];

export function MobileDock({
  value,
  onChange,
}: {
  value: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  return (
    <nav className="nav-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:hidden">
      <div className="pointer-events-auto flex rounded-2xl bg-card p-1 shadow-lg shadow-black/10 ring-1 ring-border">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = value === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              onClick={() => onChange(item.id)}
              className={cn(
                "h-auto min-h-11 flex-1 flex-col gap-0.5 rounded-xl px-1 py-1.5 text-[0.8125rem] whitespace-normal leading-none",
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}

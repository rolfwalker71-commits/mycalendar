import { CalendarDays, MoreHorizontal, Search, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileTab } from "@/lib/types";

const ITEMS: { id: MobileTab; label: string; icon: typeof Sun }[] = [
  { id: "today", label: "Heute", icon: Sun },
  { id: "calendar", label: "Kalender", icon: CalendarDays },
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
      <div className="pointer-events-auto flex rounded-2xl bg-card p-1.5 shadow-lg shadow-black/10 ring-1 ring-border">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl py-1.5 text-xs",
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70",
              )}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

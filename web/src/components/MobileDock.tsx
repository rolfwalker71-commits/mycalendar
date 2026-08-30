import type { ReactNode } from "react";
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

/** Calendar sub-nav (Agenda, Kalender, …). Pair with ModuleDock in MobileBottomStack. */
export function MobileDock({
  value,
  onChange,
  className,
}: {
  value: MobileTab;
  onChange: (tab: MobileTab) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Kalender"
      className={cn(
        "pointer-events-auto flex rounded-2xl bg-card p-1 shadow-lg shadow-black/10 ring-1 ring-border",
        className,
      )}
    >
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
    </nav>
  );
}

/** Floating bottom stack: optional calendar tools above module dock. Safe-area + inset. */
export function MobileBottomStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "nav-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 lg:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

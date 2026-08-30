import type { ReactNode } from "react";
import { CalendarDays, ListTodo, MoreHorizontal, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MobileTab } from "@/lib/types";
import { useChrome } from "@/components/ChromeProvider";
import { dockBarClass, dockItemClass, isIslandChrome } from "@/lib/platform";

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
  const { chrome } = useChrome();
  return (
    <nav
      aria-label="Kalender"
      className={cn(
        "pointer-events-auto flex",
        dockBarClass(chrome),
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
              dockItemClass(chrome, active),
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
  const { chrome } = useChrome();
  return (
    <div
      className={cn(
        "nav-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col lg:hidden",
        isIslandChrome(chrome) ? "gap-2" : "gap-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

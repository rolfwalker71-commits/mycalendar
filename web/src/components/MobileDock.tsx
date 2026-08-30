import type { ReactNode } from "react";
import { CalendarDays, ListTodo, MoreHorizontal, Search, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileTab } from "@/lib/types";
import { useChrome } from "@/components/ChromeProvider";
import { ChromeDockItem } from "@/components/ChromeDockItem";
import { dockBarClass, isIslandChrome } from "@/lib/platform";

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
      {ITEMS.map((item) => (
        <ChromeDockItem
          key={item.id}
          active={value === item.id}
          label={item.label}
          icon={item.icon}
          onClick={() => onChange(item.id)}
        />
      ))}
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

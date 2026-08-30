import { CalendarDays, Mail, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppModule } from "@/mail/types";
import { useChrome } from "@/components/ChromeProvider";
import { ChromeDockItem } from "@/components/ChromeDockItem";
import { dockBarClass } from "@/lib/platform";

const ITEMS: { id: AppModule; label: string; icon: typeof CalendarDays }[] = [
  { id: "calendar", label: "Kalender", icon: CalendarDays },
  { id: "mail", label: "Mail", icon: Mail },
  { id: "contacts", label: "Kontakte", icon: Users },
];

export function ModuleDock({
  value,
  onChange,
  className,
}: {
  value: AppModule;
  onChange: (next: AppModule) => void;
  className?: string;
}) {
  const { chrome } = useChrome();
  return (
    <nav
      aria-label="Module"
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

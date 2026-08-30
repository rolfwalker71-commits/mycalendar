import { CalendarDays, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppModule } from "@/mail/types";
import { useChrome } from "@/components/ChromeProvider";
import { dockBarClass, dockItemClass } from "@/lib/platform";

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

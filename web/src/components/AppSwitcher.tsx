import { CalendarDays, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppModule } from "@/mail/types";

export function AppSwitcher({
  value,
  onChange,
}: {
  value: AppModule;
  onChange: (next: AppModule) => void;
}) {
  return (
    <div className="inline-flex h-11 min-h-11 items-center rounded-full bg-muted p-1">
      {(
        [
          { id: "calendar", label: "Kalender", icon: CalendarDays },
          { id: "mail", label: "Mail", icon: Mail },
        ] as const
      ).map((item) => {
        const Icon = item.icon;
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex h-9 min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

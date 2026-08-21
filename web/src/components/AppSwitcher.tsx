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
    <div className="inline-flex h-10 min-h-10 items-center rounded-full bg-muted p-0.5">
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
              "flex h-9 min-h-0 flex-1 items-center justify-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-medium leading-none transition-colors",
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

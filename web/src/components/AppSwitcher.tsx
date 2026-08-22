import { CalendarDays, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppModule } from "@/mail/types";

const ITEMS = [
  { id: "calendar" as const, label: "Kalender", icon: CalendarDays },
  { id: "mail" as const, label: "Mail", icon: Mail },
  { id: "contacts" as const, label: "Kontakte", icon: Users },
];

export function AppSwitcher({
  value,
  onChange,
}: {
  value: AppModule;
  onChange: (next: AppModule) => void;
}) {
  return (
    <div className="inline-flex h-10 min-h-10 shrink-0 items-center rounded-full bg-muted p-0.5">
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
              "h-full min-h-0 items-center justify-center gap-1 rounded-full px-3 py-0 text-[0.8125rem] font-medium leading-none",
              active
                ? "bg-background text-foreground shadow-sm hover:bg-background"
                : "text-muted-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

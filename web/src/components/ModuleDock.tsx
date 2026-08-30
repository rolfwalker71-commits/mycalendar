import { CalendarDays, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppModule } from "@/mail/types";

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
  return (
    <nav
      aria-label="Module"
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

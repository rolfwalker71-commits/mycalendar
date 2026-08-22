import { CalendarDays, Mail, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  className,
}: {
  value: AppModule;
  onChange: (next: AppModule) => void;
  className?: string;
}) {
  return (
    <Tabs
      className={cn("min-w-0 w-full", className)}
      value={value}
      onValueChange={(v) => onChange((v as AppModule) ?? "calendar")}
    >
      <TabsList className="w-full">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <TabsTrigger key={item.id} value={item.id} className="px-1.5">
              <Icon />
              {item.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

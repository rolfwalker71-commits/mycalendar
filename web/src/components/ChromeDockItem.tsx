import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChrome } from "@/components/ChromeProvider";
import { dockItemClass, type ChromeStyle } from "@/lib/platform";
import { cn } from "@/lib/utils";

export function ChromeDockItem({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  const { chrome } = useChrome();
  if (chrome === "android") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1"
      >
        <span
          className={cn(
            "inline-flex h-8 min-w-14 items-center justify-center rounded-full px-5 transition-all duration-200",
            active ? "bg-secondary text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="size-6" />
        </span>
        <span
          className={cn(
            "max-w-full px-0.5 text-center text-[0.6875rem] font-medium leading-snug break-words",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </button>
    );
  }
  if (chrome === "desktop") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-sm px-1 py-1.5",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
        )}
      >
        <Icon className="size-5" />
        <span className="max-w-full text-center text-[0.6875rem] font-medium leading-snug break-words">
          {label}
        </span>
        {active ? (
          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
        ) : null}
      </button>
    );
  }
  return (
    <Button type="button" variant="ghost" onClick={onClick} className={dockItemClass("ios" satisfies ChromeStyle, active)}>
      <Icon className="size-5" />
      <span>{label}</span>
    </Button>
  );
}

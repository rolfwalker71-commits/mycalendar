import { cn } from "@/lib/utils";
import { eventArtKind, eventArtSrc } from "@/lib/eventArt";

export function EventArtBanner({
  summary,
  description,
  calendarSummary,
  eventType,
  variant = "side",
  className,
}: {
  summary?: string | null;
  description?: string | null;
  calendarSummary?: string | null;
  eventType?: string | null;
  variant?: "side" | "header";
  className?: string;
}) {
  const kind = eventArtKind({ summary, description, calendarSummary, eventType });
  if (!kind) return null;
  const src = eventArtSrc(kind, variant);
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-muted",
        variant === "header" ? "h-44 w-full" : "w-[4.75rem] min-h-[4.25rem] self-stretch",
        className,
      )}
      aria-hidden
    >
      <img src={src} alt="" draggable={false} className="h-full w-full object-cover object-center" />
    </div>
  );
}

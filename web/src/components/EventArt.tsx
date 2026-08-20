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
        "pointer-events-none relative overflow-hidden bg-muted",
        variant === "header"
          ? "h-40 w-full"
          : "w-[4.75rem] min-h-[4.25rem] self-stretch",
        className,
      )}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        className={cn(
          "h-full w-full object-cover",
          variant === "side" ? "object-center" : "object-center",
        )}
      />
      {variant === "header" ? (
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/35 to-transparent" />
      ) : null}
    </div>
  );
}

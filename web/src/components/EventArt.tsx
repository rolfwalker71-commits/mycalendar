import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { eventArtKind, eventArtSrc } from "@/lib/eventArt";

export function EventArtBanner({
  summary,
  description,
  calendarSummary,
  eventType,
  coverUrl,
  variant = "side",
  className,
}: {
  summary?: string | null;
  description?: string | null;
  calendarSummary?: string | null;
  eventType?: string | null;
  coverUrl?: string | null;
  variant?: "side" | "header";
  className?: string;
}) {
  const kind = eventArtKind({ summary, description, calendarSummary, eventType });
  const fallback = kind ? eventArtSrc(kind, variant) : null;
  const [src, setSrc] = useState(coverUrl || fallback);
  useEffect(() => {
    setSrc(coverUrl || fallback);
  }, [coverUrl, fallback]);
  if (!src) return null;
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-muted",
        variant === "header" ? "h-44 w-full" : "w-[4.75rem] min-h-[4.25rem] self-stretch",
        className,
      )}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full object-cover object-center"
        onError={() => {
          if (fallback && src !== fallback) setSrc(fallback);
        }}
      />
    </div>
  );
}

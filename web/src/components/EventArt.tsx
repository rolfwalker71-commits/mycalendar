import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { eventArtKind, eventArtSrc, type EventArtKind } from "@/lib/eventArt";
import { driveThumbUrl, eventImageFileId } from "@/lib/driveFile";
import type { EventAttachment } from "@/lib/types";

export function EventArtBanner({
  summary,
  description,
  calendarSummary,
  eventType,
  eventId,
  attachments,
  coverUrl,
  source,
  variant = "side",
  className,
  fit,
}: {
  summary?: string | null;
  description?: string | null;
  calendarSummary?: string | null;
  eventType?: string | null;
  eventId?: string | null;
  attachments?: EventAttachment[] | null;
  coverUrl?: string | null;
  source?: string | null;
  variant?: "side" | "header";
  className?: string;
  /** contain keeps logo fully visible (business/M365). */
  fit?: "cover" | "contain";
}) {
  const kind: EventArtKind =
    source === "microsoft" ? "business" : eventArtKind({ summary, description, calendarSummary, eventType });
  const fallback = eventArtSrc(kind, variant);
  const fileId = source === "microsoft" ? null : eventImageFileId(attachments);
  const proxy =
    source === "microsoft"
      ? null
      : coverUrl || (eventId && fileId ? `/api/events/${eventId}/cover?v=${encodeURIComponent(fileId)}` : null);
  const thumb = fileId ? driveThumbUrl(fileId) : null;
  const preferred = proxy || thumb || fallback;
  const [src, setSrc] = useState(preferred);
  const [failed, setFailed] = useState<string[]>([]);
  const objectFit = fit ?? (source === "microsoft" && variant === "side" ? "contain" : "cover");

  useEffect(() => {
    setSrc(preferred);
    setFailed([]);
  }, [preferred]);

  if (!src) return null;
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        source === "microsoft" ? "bg-sky-100 dark:bg-sky-950/50" : "bg-muted",
        variant === "header" ? "h-44 w-full" : "w-[5.5rem] min-h-[4.25rem] self-stretch",
        className,
      )}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn(
          "h-full w-full object-center",
          objectFit === "contain" ? "object-contain p-1.5" : "object-cover",
        )}
        onError={() => {
          const nextFailed = failed.includes(src) ? failed : [...failed, src];
          setFailed(nextFailed);
          const candidates = [proxy, thumb, fallback].filter((u): u is string => Boolean(u));
          const pick = candidates.find((u) => !nextFailed.includes(u));
          if (pick) setSrc(pick);
        }}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { eventArtKind, eventArtSrc } from "@/lib/eventArt";
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
  variant = "side",
  className,
}: {
  summary?: string | null;
  description?: string | null;
  calendarSummary?: string | null;
  eventType?: string | null;
  eventId?: string | null;
  attachments?: EventAttachment[] | null;
  coverUrl?: string | null;
  variant?: "side" | "header";
  className?: string;
}) {
  const kind = eventArtKind({ summary, description, calendarSummary, eventType });
  const fallback = kind ? eventArtSrc(kind, variant) : null;
  const fileId = eventImageFileId(attachments);
  const proxy = coverUrl || (eventId && fileId ? `/api/events/${eventId}/cover?v=${encodeURIComponent(fileId)}` : null);
  const thumb = fileId ? driveThumbUrl(fileId) : null;
  const preferred = proxy || thumb || fallback;
  const [src, setSrc] = useState(preferred);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    setSrc(preferred);
    setFailed([]);
  }, [preferred]);

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

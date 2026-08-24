import { Video } from "lucide-react";
import { cn } from "@/lib/utils";

export type MeetingKind = "teams" | "meet" | "other";

export function meetingKind(event: {
  source?: string | null;
  hangoutLink?: string | null;
}): MeetingKind | null {
  if (!event.hangoutLink) return null;
  const url = event.hangoutLink.toLowerCase();
  if (
    event.source === "microsoft" ||
    url.includes("teams.microsoft") ||
    url.includes("teams.live.com")
  ) {
    return "teams";
  }
  if (url.includes("meet.google") || event.source === "google") {
    return "meet";
  }
  return "other";
}

/** Microsoft Teams mark (purple “T” tile). */
function TeamsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#6264A7"
        d="M19.5 7.25h-5.1V5.4c0-1.05-.86-1.9-1.9-1.9H5.4C4.35 3.5 3.5 4.35 3.5 5.4v8.1c0 1.05.85 1.9 1.9 1.9h1.85V18.6c0 1.05.85 1.9 1.9 1.9h8.35c2.07 0 3.75-1.68 3.75-3.75V9.15c0-1.05-.85-1.9-1.75-1.9z"
      />
      <path
        fill="#5059C9"
        d="M13.5 8.5H5.75c-.69 0-1.25.56-1.25 1.25v6c0 .69.56 1.25 1.25 1.25H13.5c.69 0 1.25-.56 1.25-1.25v-6c0-.69-.56-1.25-1.25-1.25z"
      />
      <path
        fill="#fff"
        d="M11.35 15.1H9.9V11.4H8.15v-.95h3.2v.95H9.9v2.75h1.45v.95zm1.9 0h-1.2V10.45h1.2V15.1z"
      />
      <circle cx="17.35" cy="6.15" r="2.35" fill="#7B83EB" />
    </svg>
  );
}

/** Google Meet camera mark. */
function MeetLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#00832D" d="M12 12.5 7.5 8H4v8h3.5L12 12.5z" />
      <path fill="#0066DA" d="M12 12.5 7.5 16H16v-3.5L12 12.5z" />
      <path fill="#E37400" d="M16 8.5V12l4-2.5V8.5L16 8.5z" />
      <path fill="#2684FC" d="m12 12.5 4-2.5V8H7.5L12 12.5z" />
      <path fill="#00AC47" d="M7.5 8 12 12.5 16 8H7.5z" />
      <path fill="#FFBA00" d="M16 12v3.5l4-2.5V12l-4 2.5z" />
    </svg>
  );
}

export function MeetingLinkHint({
  source,
  hangoutLink,
  className,
}: {
  source?: string | null;
  hangoutLink?: string | null;
  className?: string;
}) {
  const kind = meetingKind({ source, hangoutLink });
  if (!kind || !hangoutLink) return null;

  const label = kind === "teams" ? "Teams" : kind === "meet" ? "Google Meet" : "Videocall";

  return (
    <p className={cn("mt-1 flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
      {kind === "teams" ? (
        <TeamsLogo className="size-3.5 shrink-0" />
      ) : kind === "meet" ? (
        <MeetLogo className="size-3.5 shrink-0" />
      ) : (
        <Video className="size-3.5 shrink-0" />
      )}
      <span>{label}</span>
    </p>
  );
}

export function MeetingChipIcon({
  source,
  hangoutLink,
  className,
}: {
  source?: string | null;
  hangoutLink?: string | null;
  className?: string;
}) {
  const kind = meetingKind({ source, hangoutLink });
  if (!kind) return null;
  if (kind === "teams") return <TeamsLogo className={cn("size-3 shrink-0", className)} />;
  if (kind === "meet") return <MeetLogo className={cn("size-3 shrink-0", className)} />;
  return <Video className={cn("size-3 shrink-0", className)} />;
}

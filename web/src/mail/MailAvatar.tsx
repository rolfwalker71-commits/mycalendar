import { useState } from "react";
import { cn } from "@/lib/utils";
import { displayName, initials } from "./format";
import type { MailAddress } from "./types";

const FALLBACK = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-100",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-100",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-100",
];

function tone(email: string): string {
  let n = 0;
  for (const ch of email) n = (n + ch.charCodeAt(0)) % FALLBACK.length;
  return FALLBACK[n];
}

export function MailAvatar({
  addr,
  selfEmail,
  selfPhoto,
  className,
}: {
  addr: MailAddress;
  selfEmail?: string;
  selfPhoto?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const own =
    Boolean(selfPhoto) &&
    addr.email &&
    selfEmail &&
    addr.email.toLowerCase() === selfEmail.toLowerCase();
  const src = own ? selfPhoto : addr.avatarUrl;

  return (
    <span
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-medium",
        tone(addr.email || addr.name),
        className,
      )}
      title={displayName(addr)}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(addr)
      )}
    </span>
  );
}

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import {
  applyDocumentIcon,
  calendarDayNumber,
  msUntilNextZoneMidnight,
} from "@/lib/appMark";

function MailBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 34" className={className} aria-hidden>
      <rect width="40" height="34" rx="8" className="fill-white dark:fill-[#e8e8ed]" />
      <path d="M6 8h28L20 19z" fill="#FF3B30" />
    </svg>
  );
}

export function AppLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  const { dark } = useTheme();
  const shadowId = useId().replace(/:/g, "");
  const [day, setDay] = useState(calendarDayNumber);

  useEffect(() => {
    const sync = () => setDay(calendarDayNumber());
    applyDocumentIcon(day, dark);
    const timer = window.setTimeout(sync, msUntilNextZoneMidnight());
    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [day, dark]);

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      role="img"
      aria-label={`Kalender & Mail, ${day}.`}
    >
      <svg
        viewBox="0 0 128 128"
        width={size}
        height={size}
        className="size-full overflow-visible"
      >
        <defs>
          <filter id={shadowId} x="-18%" y="-18%" width="136%" height="136%">
            <feDropShadow dx="0" dy="1.6" stdDeviation="1.8" floodColor="rgba(28,28,30,0.22)" />
          </filter>
        </defs>
        <g filter={`url(#${shadowId})`}>
          <rect
            x="18"
            y="16"
            width="78"
            height="86"
            rx="16"
            className="fill-white dark:fill-[#2c2c2e]"
          />
          <path d="M18 32a16 16 0 0 1 16-16h46a16 16 0 0 1 16 16v12H18V32z" fill="#FF3B30" />
          <circle cx="44" cy="28" r="4.2" className="fill-[#3a3a3c] dark:fill-[#1c1c1e]" />
          <circle cx="70" cy="28" r="4.2" className="fill-[#3a3a3c] dark:fill-[#1c1c1e]" />
          <text
            x="57"
            y={day < 10 ? 82 : 79}
            textAnchor="middle"
            className="fill-[#1c1c1e] dark:fill-[#f5f5f7]"
            style={{
              fontFamily: "ui-rounded, ui-sans-serif, system-ui, sans-serif",
              fontSize: day < 10 ? 46 : 38,
              fontWeight: 800,
            }}
          >
            {day}
          </text>
        </g>
      </svg>
      <MailBadge className="absolute right-[4%] bottom-[6%] w-[34%] drop-shadow-sm" />
    </span>
  );
}

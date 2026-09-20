import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import {
  appMarkSvg,
  applyDocumentIcon,
  calendarDayNumber,
  msUntilNextZoneMidnight,
} from "@/lib/appMark";

export function AppLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  const { dark } = useTheme();
  const [day, setDay] = useState(calendarDayNumber);
  const markSvg = useMemo(
    () => appMarkSvg(day, dark).replace(/^<\?xml[^>]*\?>/, "").replace("<svg ", '<svg style="width:100%;height:100%;display:block" '),
    [day, dark],
  );

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
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Kalender & Mail, ${day}.`}
      // Eigene, erzeugte Grafik — dieselbe wie App-Icon und Favicon.
      dangerouslySetInnerHTML={{ __html: markSvg }}
    />
  );
}

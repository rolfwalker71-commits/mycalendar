import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { now } from "@/lib/dates";
import { useWeather } from "@/lib/weather";

export type WeatherDay = {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
};

export type WeatherPayload = {
  name: string;
  latitude: number;
  longitude: number;
  fallback: boolean;
  current: { temp: number; code: number };
  days: WeatherDay[];
};

export function weatherIcon(code: number): LucideIcon {
  if (code <= 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return CloudSnow;
  if ([95, 96, 99].includes(code)) return CloudLightning;
  return CloudRain;
}

/** WMO-code colors that stay readable in light and dark mode. */
export function weatherIconClass(code: number): string {
  if (code <= 1) return "text-amber-500";
  if (code === 2) {
    return "text-amber-500 [&>path:last-child]:stroke-slate-400 dark:[&>path:last-child]:stroke-slate-300";
  }
  if (code === 3) return "text-slate-500 dark:text-slate-400";
  if (code === 45 || code === 48) return "text-slate-400 dark:text-slate-300";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "text-sky-500";
  if ([95, 96, 99].includes(code)) {
    return "text-violet-400 dark:text-violet-300 [&>path:last-child]:stroke-amber-500";
  }
  return "text-blue-500";
}

export function WeatherMark({
  code,
  temp,
  name,
  compact,
  className,
}: {
  code: number;
  temp: number;
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  const Icon = weatherIcon(code);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        compact ? "text-[0.6875rem]" : "text-sm",
        className,
      )}
      title={name}
    >
      <Icon
        className={cn(
          compact ? "size-3.5" : "size-4",
          "shrink-0",
          weatherIconClass(code),
        )}
      />
      <span className="tabular-nums text-muted-foreground">{temp}°</span>
    </span>
  );
}

export function HeaderWeather() {
  const { weather, day } = useWeather();
  if (!weather) return null;
  const today = day(now().toISODate());
  const temp = weather.current.temp;
  const code = weather.current.code;
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight">
      <WeatherMark code={code} temp={temp} name={weather.name} />
      <span className="max-w-[7.5rem] truncate text-[0.6875rem] text-muted-foreground">
        {weather.name}
      </span>
      {today && today.tMax !== temp ? (
        <span className="text-[0.625rem] text-muted-foreground tabular-nums">
          {today.tMin}–{today.tMax}°
        </span>
      ) : null}
    </span>
  );
}

export function DayWeather({
  iso,
  compact,
}: {
  iso: string | null;
  compact?: boolean;
}) {
  const { weather, day } = useWeather();
  const hit = day(iso);
  if (!hit) return null;
  const todayIso = now().toISODate();
  const temp = iso === todayIso && weather ? weather.current.temp : hit.tMax;
  const code = iso === todayIso && weather ? weather.current.code : hit.code;
  return (
    <WeatherMark
      code={code}
      temp={temp}
      name={weather?.name}
      compact={compact ?? true}
    />
  );
}

export function LineWeather({ iso }: { iso: string }) {
  const { weather, day } = useWeather();
  const hit = day(iso);
  if (!hit || !weather) return null;
  const todayIso = now().toISODate();
  const temp = iso === todayIso ? weather.current.temp : hit.tMax;
  const code = iso === todayIso ? weather.current.code : hit.code;
  const Icon = weatherIcon(code);
  return (
    <span
      className="inline-flex max-w-[55%] shrink-0 items-center gap-1 text-sm text-muted-foreground"
      title={`${weather.name} ${temp}°`}
    >
      <Icon className={cn("size-3.5 shrink-0", weatherIconClass(code))} />
      <span className="truncate">{weather.name}</span>
      <span className="tabular-nums">{temp}°</span>
    </span>
  );
}

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { parseFlightRoute } from "@/lib/flights";
import { cn } from "@/lib/utils";

function mapsHref(location: string, lat: number, lon: number): string {
  const q = encodeURIComponent(location);
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (ios) return `https://maps.apple.com/?q=${q}&ll=${lat},${lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
}

function flightHref(from: string, to: string): string {
  const origin = encodeURIComponent(`${from} airport`);
  const dest = encodeURIComponent(`${to} airport`);
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (ios) return `https://maps.apple.com/?saddr=${origin}&daddr=${dest}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
}

export function EventMapSnippet({
  location,
  summary,
  className,
}: {
  location?: string | null;
  summary?: string | null;
  className?: string;
}) {
  const query = location?.trim() ?? "";
  const route = parseFlightRoute(query, summary);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    const nextRoute = parseFlightRoute(query, summary);
    if (nextRoute || query.length < 3) {
      setCoords(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiClient
        .mapsPreview(query)
        .then((res) => {
          if (cancelled) return;
          if (res.lat == null || res.lon == null) {
            setCoords(null);
            return;
          }
          setCoords({ lat: res.lat, lon: res.lon });
        })
        .catch(() => {
          if (!cancelled) setCoords(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, summary]);

  if (route) {
    const src = `/api/maps/static?from=${encodeURIComponent(route.from)}&to=${encodeURIComponent(route.to)}&w=640&h=280&v=flight3`;
    return (
      <a
        href={flightHref(route.from, route.to)}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "mt-2 block overflow-hidden rounded-md bg-[#f4f1ea] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]",
          className,
        )}
        aria-label={`Flugroute ${route.from} nach ${route.to}`}
      >
        <img src={src} alt="" draggable={false} className="h-auto w-full" loading="lazy" />
      </a>
    );
  }

  if (!coords) return null;

  const src = `/api/maps/static?lat=${coords.lat}&lon=${coords.lon}&w=640&h=200&v=voyager`;
  return (
    <a
      href={mapsHref(query, coords.lat, coords.lon)}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "mt-2 block overflow-hidden rounded-md bg-[#f4f1ea] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]",
        className,
      )}
      aria-label={`Karte für ${query}`}
    >
      <img src={src} alt="" draggable={false} className="h-32 w-full object-cover" loading="lazy" />
    </a>
  );
}

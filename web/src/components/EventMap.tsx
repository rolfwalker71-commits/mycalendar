import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { useStandalonePwa } from "@/lib/pwa";
import { cn } from "@/lib/utils";

function mapsHref(location: string, lat: number, lon: number): string {
  const q = encodeURIComponent(location);
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (ios) return `https://maps.apple.com/?q=${q}&ll=${lat},${lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function EventMapSnippet({
  location,
  className,
}: {
  location?: string | null;
  className?: string;
}) {
  const pwa = useStandalonePwa();
  const query = location?.trim() ?? "";
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!pwa || query.length < 8) {
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
  }, [pwa, query]);

  if (!pwa || !coords) return null;

  const src = `/api/maps/static?lat=${coords.lat}&lon=${coords.lon}&w=560&h=160`;
  return (
    <a
      href={mapsHref(query, coords.lat, coords.lon)}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={cn("mt-2 block overflow-hidden rounded-xl ring-1 ring-border", className)}
      aria-label={`Karte für ${query}`}
    >
      <img
        src={src}
        alt=""
        className="h-28 w-full object-cover"
        loading="lazy"
      />
    </a>
  );
}

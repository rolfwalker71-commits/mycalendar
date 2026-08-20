import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { WeatherDay, WeatherPayload } from "@/components/WeatherMark";

const GEO_KEY = "kalender-geo";
const ALTDORF = { lat: 46.8806, lon: 8.6444 };

type StoredGeo = { lat: number; lon: number; denied?: boolean };

let cached: WeatherPayload | null = null;
let inflight: Promise<WeatherPayload> | null = null;
const listeners = new Set<(data: WeatherPayload | null) => void>();

function readStored(): StoredGeo | null {
  try {
    const raw = localStorage.getItem(GEO_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredGeo;
  } catch {
    return null;
  }
}

function saveStored(geo: StoredGeo): void {
  localStorage.setItem(GEO_KEY, JSON.stringify(geo));
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherPayload> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return api<WeatherPayload>(`/api/weather?${q}`);
}

function notify(data: WeatherPayload | null): void {
  cached = data;
  for (const fn of listeners) fn(data);
}

function detectCoords(): Promise<{ lat: number; lon: number } | null> {
  const stored = readStored();
  if (stored?.denied) return Promise.resolve(null);
  if (stored && Number.isFinite(stored.lat) && Number.isFinite(stored.lon)) {
    return Promise.resolve({ lat: stored.lat, lon: stored.lon });
  }
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        saveStored(next);
        resolve(next);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) saveStored({ ...ALTDORF, denied: true });
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

async function loadWeather(): Promise<WeatherPayload> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const stored = readStored();
    const initial =
      stored && !stored.denied
        ? { lat: stored.lat, lon: stored.lon }
        : ALTDORF;
    const first = await fetchWeather(initial.lat, initial.lon);
    notify(first);
    if (stored?.denied || stored) return first;
    const coords = await detectCoords();
    if (!coords) return first;
    if (
      Math.abs(coords.lat - initial.lat) < 0.04 &&
      Math.abs(coords.lon - initial.lon) < 0.04
    ) {
      return first;
    }
    const next = await fetchWeather(coords.lat, coords.lon);
    notify(next);
    return next;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function useWeather(): {
  weather: WeatherPayload | null;
  day: (iso: string | null | undefined) => WeatherDay | undefined;
} {
  const [weather, setWeather] = useState<WeatherPayload | null>(cached);
  useEffect(() => {
    listeners.add(setWeather);
    loadWeather().catch(() => undefined);
    return () => {
      listeners.delete(setWeather);
    };
  }, []);
  return {
    weather,
    day(iso) {
      if (!iso || !weather) return undefined;
      return weather.days.find((d) => d.date === iso);
    },
  };
}

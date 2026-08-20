import { Router } from "express";
import { requireAuth } from "../auth.js";

export const weatherRouter = Router();
weatherRouter.use(requireAuth);

export const ALTDORF = {
  lat: 46.8806,
  lon: 8.6444,
  name: "Altdorf UR",
};

type WeatherDay = {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
};

type Payload = {
  name: string;
  latitude: number;
  longitude: number;
  fallback: boolean;
  current: { temp: number; code: number };
  days: WeatherDay[];
};

const cache = new Map<string, { at: number; data: Payload }>();
const TTL = 20 * 60 * 1000;

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function nearAltdorf(lat: number, lon: number): boolean {
  return Math.abs(lat - ALTDORF.lat) < 0.04 && Math.abs(lon - ALTDORF.lon) < 0.04;
}

async function reverseName(lat: number, lon: number): Promise<string> {
  if (nearAltdorf(lat, lon)) return ALTDORF.name;
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "12");
  url.searchParams.set("accept-language", "de");
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Kalender-Mail/1.0 (self-hosted; weather)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  const data = (await res.json()) as {
    name?: string;
    address?: Record<string, string>;
  };
  const a = data.address ?? {};
  const local =
    a.village || a.town || a.city || a.municipality || a.hamlet || data.name || "";
  const iso = a["ISO3166-2-lvl4"] ?? "";
  const canton = iso.startsWith("CH-") ? iso.slice(3) : "";
  if (local && canton) return `${local} ${canton}`;
  return local || ALTDORF.name;
}

async function fetchForecast(lat: number, lon: number): Promise<Payload> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", "Europe/Berlin");
  url.searchParams.set("forecast_days", "16");
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Wetterdienst nicht erreichbar.");
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };
  const times = data.daily?.time ?? [];
  const days: WeatherDay[] = times.map((date, i) => ({
    date,
    code: data.daily?.weather_code?.[i] ?? 0,
    tMax: Math.round(data.daily?.temperature_2m_max?.[i] ?? 0),
    tMin: Math.round(data.daily?.temperature_2m_min?.[i] ?? 0),
  }));
  const fallback = nearAltdorf(lat, lon);
  let name = ALTDORF.name;
  if (!fallback) {
    try {
      name = await reverseName(lat, lon);
    } catch {
      name = "Aktueller Standort";
    }
  }
  return {
    name,
    latitude: lat,
    longitude: lon,
    fallback,
    current: {
      temp: Math.round(data.current?.temperature_2m ?? days[0]?.tMax ?? 0),
      code: data.current?.weather_code ?? days[0]?.code ?? 0,
    },
    days,
  };
}

weatherRouter.get("/", async (req, res) => {
  const latRaw = Number(req.query.lat);
  const lonRaw = Number(req.query.lon);
  const lat = Number.isFinite(latRaw) ? latRaw : ALTDORF.lat;
  const lon = Number.isFinite(lonRaw) ? lonRaw : ALTDORF.lon;
  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    res.json(hit.data);
    return;
  }
  try {
    const data = await fetchForecast(lat, lon);
    cache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error("Wetter:", err);
    res.status(502).json({ error: "Wetter konnte nicht geladen werden." });
  }
});

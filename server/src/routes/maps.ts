import { Router } from "express";
import { requireAuth } from "../auth.js";

export const mapsRouter = Router();
mapsRouter.use(requireAuth);

const UA = "Kalender-Mail/1.0 (self-hosted; maps)";
const GEO_TTL = 30 * 24 * 60 * 60 * 1000;
const IMG_TTL = 7 * 24 * 60 * 60 * 1000;

type Geo = { lat: number; lon: number };
const geoCache = new Map<string, { at: number; data: Geo | null }>();
const imgCache = new Map<string, { at: number; body: Buffer; type: string }>();

let nominatimTail = Promise.resolve();

function enqueueNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimTail.then(fn, fn);
  nominatimTail = run.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, 1100)),
    () => new Promise<void>((resolve) => setTimeout(resolve, 1100)),
  );
  return run;
}

export function looksLikeAddress(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 8) return false;
  if (/^https?:/i.test(text)) return false;
  if (/meet\.google|zoom\.us|teams\.microsoft|webex\.com/i.test(text)) return false;
  if (/^(homeoffice|home|zuhause|büro|buero|office|remote|online)$/i.test(text)) return false;
  return /\d/.test(text) || text.includes(",");
}

function geoKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

async function geocode(q: string): Promise<Geo | null> {
  const key = geoKey(q);
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.data;
  const data = await enqueueNominatim(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("accept-language", "de");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat?: string; lon?: string }[];
    const lat = Number(rows[0]?.lat);
    const lon = Number(rows[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  });
  geoCache.set(key, { at: Date.now(), data });
  return data;
}

function tileXY(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    ),
  };
}

async function fetchStaticPng(lat: number, lon: number, w: number, h: number): Promise<{ body: Buffer; type: string }> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)},${w}x${h}`;
  const hit = imgCache.get(key);
  if (hit && Date.now() - hit.at < IMG_TTL) return { body: hit.body, type: hit.type };

  const staticUrl =
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}` +
    `&zoom=16&size=${w}x${h}&maptype=mapnik&markers=${lat},${lon},red-pushpin`;
  let body: Buffer | null = null;
  let type = "image/png";
  try {
    const res = await fetch(staticUrl, {
      headers: { "User-Agent": UA, Accept: "image/png,image/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 800) {
        body = buf;
        type = res.headers.get("content-type")?.split(";")[0] || "image/png";
      }
    }
  } catch {
    /* fallback below */
  }
  if (!body) {
    const { x, y } = tileXY(lat, lon, 16);
    const res = await fetch(`https://tile.openstreetmap.org/16/${x}/${y}.png`, {
      headers: { "User-Agent": UA, Accept: "image/png" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("Karte nicht erreichbar.");
    body = Buffer.from(await res.arrayBuffer());
    type = "image/png";
  }
  imgCache.set(key, { at: Date.now(), body, type });
  return { body, type };
}

mapsRouter.get("/preview", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || !looksLikeAddress(q)) {
    res.json({ lat: null, lon: null });
    return;
  }
  try {
    const geo = await geocode(q);
    res.json(geo ?? { lat: null, lon: null });
  } catch (err) {
    console.error("Karte Geocode:", err);
    res.status(502).json({ error: "Adresse konnte nicht gefunden werden." });
  }
});

mapsRouter.get("/static", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const w = Math.min(640, Math.max(240, Number(req.query.w) || 560));
  const h = Math.min(320, Math.max(80, Number(req.query.h) || 160));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "Koordinaten fehlen." });
    return;
  }
  try {
    const img = await fetchStaticPng(lat, lon, w, h);
    res.setHeader("Content-Type", img.type);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(img.body);
  } catch (err) {
    console.error("Karte Bild:", err);
    res.status(502).json({ error: "Kartenausschnitt konnte nicht geladen werden." });
  }
});

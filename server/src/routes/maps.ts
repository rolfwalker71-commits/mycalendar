import { Router } from "express";
import { requireAuth } from "../auth.js";

export const mapsRouter = Router();
mapsRouter.use(requireAuth);

const UA = "Kalender-Mail/1.0 (self-hosted; maps)";
const GEO_TTL = 30 * 24 * 60 * 60 * 1000;
const IMG_TTL = 7 * 24 * 60 * 60 * 1000;

export type PlaceHit = {
  label: string;
  lat: number;
  lon: number;
};

type Geo = { lat: number; lon: number; label?: string };
const geoCache = new Map<string, { at: number; data: Geo | null }>();
const suggestCache = new Map<string, { at: number; data: PlaceHit[] }>();
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

export function looksLikePlace(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 3) return false;
  if (/^https?:/i.test(text)) return false;
  if (/meet\.google|zoom\.us|teams\.microsoft|webex\.com/i.test(text)) return false;
  if (/^(homeoffice|home|zuhause|büro|buero|office|remote|online|tbd|tba)$/i.test(text)) {
    return false;
  }
  return true;
}

function geoKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatPhoton(props: {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  locality?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
}): string {
  const city = props.city || props.locality || props.district || props.county || "";
  const street = [props.street, props.housenumber].filter(Boolean).join(" ");
  return [props.name, street, city, props.country].filter(Boolean).join(", ");
}

async function photonSearch(q: string, limit: number): Promise<PlaceHit[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "de");
  url.searchParams.set("lat", "46.8806");
  url.searchParams.set("lon", "8.6444");
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: {
      geometry?: { coordinates?: number[] };
      properties?: {
        name?: string;
        street?: string;
        housenumber?: string;
        city?: string;
        locality?: string;
        district?: string;
        county?: string;
        country?: string;
      };
    }[];
  };
  const hits: PlaceHit[] = [];
  for (const f of data.features ?? []) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = formatPhoton(f.properties ?? {});
    if (!label) continue;
    hits.push({ label, lat, lon });
  }
  return hits;
}

async function nominatimSearch(q: string, limit: number): Promise<PlaceHit[]> {
  return enqueueNominatim(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "de");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
      name?: string;
    }[];
    return rows
      .map((row) => {
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return { label: row.display_name || row.name || q, lat, lon };
      })
      .filter((x): x is PlaceHit => Boolean(x));
  });
}

async function suggestPlaces(q: string): Promise<PlaceHit[]> {
  const key = geoKey(q);
  const hit = suggestCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  let data: PlaceHit[] = [];
  try {
    data = await photonSearch(q, 6);
  } catch {
    data = [];
  }
  if (!data.length) {
    try {
      data = await nominatimSearch(q, 5);
    } catch {
      data = [];
    }
  }
  suggestCache.set(key, { at: Date.now(), data });
  return data;
}

async function geocode(q: string): Promise<Geo | null> {
  const key = geoKey(q);
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.data;
  const places = await suggestPlaces(q);
  const data = places[0] ? { lat: places[0].lat, lon: places[0].lon, label: places[0].label } : null;
  geoCache.set(key, { at: Date.now(), data });
  return data;
}

function mercatorTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

async function fetchTilePng(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/png,image/jpeg,image/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 400 ? buf : null;
  } catch {
    return null;
  }
}

function wrapTile(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return ((x % n) + n) % n;
}

async function fetchBasemapTile(z: number, x: number, y: number): Promise<{ buf: Buffer; mime: string } | null> {
  const tx = wrapTile(x, z);
  if (y < 0 || y >= 2 ** z) return null;
  const voyager = await fetchTilePng(
    `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${tx}/${y}@2x.png`,
  );
  if (voyager) return { buf: voyager, mime: "image/png" };
  const osm = await fetchTilePng(`https://tile.openstreetmap.org/${z}/${tx}/${y}.png`);
  if (osm) return { buf: osm, mime: "image/png" };
  return null;
}

function mapPinSvg(cx: number, cy: number): string {
  return `
    <g transform="translate(${cx} ${cy})" fill="none">
      <ellipse cx="0" cy="3" rx="9" ry="3.2" fill="rgba(15,23,42,0.28)"/>
      <path d="M0-32c-11.2 0-20.2 8.4-20.2 19.4 0 13.4 16.4 28.8 19.4 31.4a1.2 1.2 0 0 0 1.6 0c3-2.6 19.4-18 19.4-31.4C20.2-23.6 11.2-32 0-32z" fill="#e11d48"/>
      <circle cx="0" cy="-14.5" r="7.2" fill="#fff"/>
    </g>`;
}

async function fetchStaticMap(
  lat: number,
  lon: number,
  w: number,
  h: number,
): Promise<{ body: Buffer; type: string }> {
  const zoom = 16;
  const key = `voyager@2x,${lat.toFixed(5)},${lon.toFixed(5)},${w}x${h},z${zoom}`;
  const hit = imgCache.get(key);
  if (hit && Date.now() - hit.at < IMG_TTL) return { body: hit.body, type: hit.type };

  const scale = 2;
  const tilePx = 256 * scale;
  const outW = w * scale;
  const outH = h * scale;
  const { x, y } = mercatorTile(lat, lon, zoom);
  const left = x * tilePx - outW / 2;
  const top = y * tilePx - outH / 2;
  const x0 = Math.floor(left / tilePx);
  const y0 = Math.floor(top / tilePx);
  const x1 = Math.floor((left + outW - 1) / tilePx);
  const y1 = Math.floor((top + outH - 1) / tilePx);

  const jobs: { tx: number; ty: number; px: number; py: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      jobs.push({
        tx,
        ty,
        px: tx * tilePx - left,
        py: ty * tilePx - top,
      });
    }
  }

  const tiles = await Promise.all(
    jobs.map(async (job) => {
      const tile = await fetchBasemapTile(zoom, job.tx, job.ty);
      if (!tile) return null;
      return { ...job, href: `data:${tile.mime};base64,${tile.buf.toString("base64")}` };
    }),
  );
  const layers = tiles.filter((t): t is NonNullable<typeof t> => Boolean(t));
  if (!layers.length) throw new Error("Karte nicht erreichbar.");

  const images = layers
    .map(
      (t) =>
        `<image href="${t.href}" x="${t.px.toFixed(1)}" y="${t.py.toFixed(1)}" width="${tilePx}" height="${tilePx}" preserveAspectRatio="none"/>`,
    )
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${outW} ${outH}">
  <rect width="${outW}" height="${outH}" fill="#f4f1ea"/>
  ${images}
  ${mapPinSvg(outW / 2, outH / 2 + 8)}
  <rect x="${outW - 228}" y="${outH - 34}" width="216" height="22" rx="6" fill="rgba(255,255,255,0.82)"/>
  <text x="${outW - 20}" y="${outH - 18}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16" fill="#64748b">© OpenStreetMap · CARTO</text>
</svg>`;

  const body = Buffer.from(svg, "utf8");
  const type = "image/svg+xml";
  imgCache.set(key, { at: Date.now(), body, type });
  return { body, type };
}

mapsRouter.get("/suggest", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length < 2) {
    res.json({ places: [] });
    return;
  }
  try {
    const places = await suggestPlaces(q);
    res.json({ places });
  } catch (err) {
    console.error("Ortssuche:", err);
    res.status(502).json({ error: "Orte konnten nicht geladen werden." });
  }
});

mapsRouter.get("/preview", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || !looksLikePlace(q)) {
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
    const img = await fetchStaticMap(lat, lon, w, h);
    res.setHeader(
      "Content-Type",
      img.type.includes("svg") ? "image/svg+xml; charset=utf-8" : img.type,
    );
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(img.body);
  } catch (err) {
    console.error("Karte Bild:", err);
    res.status(502).json({ error: "Kartenausschnitt konnte nicht geladen werden." });
  }
});

import { Router } from "express";
import { requireAuth } from "../auth.js";
import { iataCoords } from "../airports.js";

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

function mapPinSvg(cx: number, cy: number, color = "#e11d48"): string {
  return `
    <g transform="translate(${cx} ${cy})" fill="none">
      <ellipse cx="0" cy="3" rx="9" ry="3.2" fill="rgba(15,23,42,0.28)"/>
      <path d="M0-32c-11.2 0-20.2 8.4-20.2 19.4 0 13.4 16.4 28.8 19.4 31.4a1.2 1.2 0 0 0 1.6 0c3-2.6 19.4-18 19.4-31.4C20.2-23.6 11.2-32 0-32z" fill="${color}"/>
      <circle cx="0" cy="-14.5" r="7.2" fill="#fff"/>
    </g>`;
}

function airportDotSvg(cx: number, cy: number, label: string): string {
  const safe = label.replace(/[<>&"]/g, "");
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="9" fill="#1d4ed8" stroke="#fff" stroke-width="3"/>
      <rect x="${cx - 28}" y="${cy - 36}" width="56" height="22" rx="6" fill="rgba(15,23,42,0.78)"/>
      <text x="${cx}" y="${cy - 20}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="700" fill="#fff">${safe}</text>
    </g>`;
}

function quadPoint(
  t: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  };
}

function planeSvg(cx: number, cy: number, angle: number): string {
  return `
    <g transform="translate(${cx} ${cy}) rotate(${angle})">
      <path d="M-11 0 L11 0 L6 -4 L14 -1 L11 0 L14 1 L6 4 Z" fill="#1d4ed8" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
    </g>`;
}

type MapPoint = { lat: number; lon: number; label?: string };

async function resolveAirport(raw: string): Promise<MapPoint | null> {
  const text = raw.trim();
  if (!text) return null;
  if (/^[A-Za-z]{3}$/.test(text)) {
    const hit = iataCoords(text);
    if (hit) return { ...hit, label: text.toUpperCase() };
    const geo = await geocode(`${text.toUpperCase()} airport`);
    return geo ? { lat: geo.lat, lon: geo.lon, label: text.toUpperCase() } : null;
  }
  const geo = await geocode(`${text} Flughafen`);
  if (geo) return { lat: geo.lat, lon: geo.lon, label: text };
  return geocode(text);
}

function worldPx(lat: number, lon: number, zoom: number, tilePx: number): { x: number; y: number } {
  const t = mercatorTile(lat, lon, zoom);
  return { x: t.x * tilePx, y: t.y * tilePx };
}

function fitZoom(points: MapPoint[], outW: number, outH: number, tilePx: number): number {
  for (let z = 8; z >= 2; z--) {
    const pts = points.map((p) => worldPx(p.lat, p.lon, z, tilePx));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    if (maxX - minX + 140 <= outW && maxY - minY + 120 <= outH) return z;
  }
  return 2;
}

async function stitchTiles(
  zoom: number,
  left: number,
  top: number,
  outW: number,
  outH: number,
  tilePx: number,
): Promise<string> {
  const x0 = Math.floor(left / tilePx);
  const y0 = Math.floor(top / tilePx);
  const x1 = Math.floor((left + outW - 1) / tilePx);
  const y1 = Math.floor((top + outH - 1) / tilePx);
  const jobs: { tx: number; ty: number; px: number; py: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      jobs.push({ tx, ty, px: tx * tilePx - left, py: ty * tilePx - top });
    }
  }
  if (jobs.length > 24) throw new Error("Kartenausschnitt zu gross.");
  const tiles = await Promise.all(
    jobs.map(async (job) => {
      const tile = await fetchBasemapTile(zoom, job.tx, job.ty);
      if (!tile) return null;
      return { ...job, href: `data:${tile.mime};base64,${tile.buf.toString("base64")}` };
    }),
  );
  const layers = tiles.filter((t): t is NonNullable<typeof t> => Boolean(t));
  if (!layers.length) throw new Error("Karte nicht erreichbar.");
  return layers
    .map(
      (t) =>
        `<image href="${t.href}" x="${t.px.toFixed(1)}" y="${t.py.toFixed(1)}" width="${tilePx}" height="${tilePx}" preserveAspectRatio="none"/>`,
    )
    .join("");
}

async function fetchStaticMap(
  points: MapPoint[],
  w: number,
  h: number,
): Promise<{ body: Buffer; type: string }> {
  const key = `voyager@2x,${points.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)},${p.label ?? ""}`).join("|")},${w}x${h}`;
  const hit = imgCache.get(key);
  if (hit && Date.now() - hit.at < IMG_TTL) return { body: hit.body, type: hit.type };

  const scale = 2;
  const tilePx = 256 * scale;
  const outW = w * scale;
  const outH = h * scale;
  const route = points.length >= 2;
  const zoom = route ? fitZoom(points, outW, outH, tilePx) : 16;
  const pts = points.map((p) => worldPx(p.lat, p.lon, zoom, tilePx));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const left = route ? (minX + maxX) / 2 - outW / 2 : pts[0].x - outW / 2;
  const top = route ? (minY + maxY) / 2 - outH / 2 : pts[0].y - outH / 2;
  const images = await stitchTiles(zoom, left, top, outW, outH, tilePx);

  let overlay = "";
  if (route) {
    const a = { x: pts[0].x - left, y: pts[0].y - top };
    const b = { x: pts[1].x - left, y: pts[1].y - top };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const bulge = Math.min(len * 0.22, outH * 0.3);
    const cx = (a.x + b.x) / 2 - (dy / len) * bulge;
    const cy = (a.y + b.y) / 2 + (dx / len) * bulge;
    const mid = quadPoint(0.55, a.x, a.y, cx, cy, b.x, b.y);
    const near = quadPoint(0.62, a.x, a.y, cx, cy, b.x, b.y);
    const angle = (Math.atan2(near.y - mid.y, near.x - mid.x) * 180) / Math.PI;
    overlay = `
      <path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}" fill="none" stroke="#1d4ed8" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round" opacity="0.92"/>
      ${planeSvg(mid.x, mid.y, angle)}
      ${airportDotSvg(a.x, a.y, points[0].label ?? "A")}
      ${airportDotSvg(b.x, b.y, points[1].label ?? "B")}
    `;
  } else {
    overlay = mapPinSvg(outW / 2, outH / 2 + 8);
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${outW} ${outH}">
  <rect width="${outW}" height="${outH}" fill="#f4f1ea"/>
  ${images}
  ${overlay}
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
  const w = Math.min(640, Math.max(240, Number(req.query.w) || 560));
  const h = Math.min(320, Math.max(80, Number(req.query.h) || 160));
  const fromQ = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toQ = typeof req.query.to === "string" ? req.query.to.trim() : "";
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const lat2 = Number(req.query.lat2);
  const lon2 = Number(req.query.lon2);
  try {
    let points: MapPoint[] = [];
    if (fromQ && toQ) {
      const [a, b] = await Promise.all([resolveAirport(fromQ), resolveAirport(toQ)]);
      if (a && b) points = [a, b];
    } else if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(lat2) && Number.isFinite(lon2)) {
      points = [
        { lat, lon, label: fromQ || undefined },
        { lat: lat2, lon: lon2, label: toQ || undefined },
      ];
    } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points = [{ lat, lon }];
    }
    if (!points.length) {
      res.status(400).json({ error: "Koordinaten fehlen." });
      return;
    }
    const img = await fetchStaticMap(points, w, h);
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

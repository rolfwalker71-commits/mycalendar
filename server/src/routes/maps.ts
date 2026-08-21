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

/** Uri / Altdorf — Nutzer sind in der Zentralschweiz. */
const HOME = { lat: 46.8806, lon: 8.6444 };

type RankedHit = PlaceHit & { country?: string; name?: string };

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
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
  postcode?: string;
  countrycode?: string;
}): string {
  const city = props.city || props.locality || props.district || props.county || "";
  const street = [props.street, props.housenumber].filter(Boolean).join(" ");
  const place = [props.postcode, city].filter(Boolean).join(" ");
  const country = props.country || (props.countrycode === "CH" ? "Schweiz" : "");
  return [props.name, street, place, country].filter(Boolean).join(", ");
}

function isSwiss(country?: string): boolean {
  const c = (country ?? "").trim().toLowerCase();
  return c === "ch" || c === "schweiz" || c === "switzerland" || c === "suisse";
}

function limitMs<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

async function photonSearch(
  q: string,
  limit: number,
  bias: { lat: number; lon: number } = HOME,
  zoom = 8,
): Promise<RankedHit[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "de");
  url.searchParams.set("lat", String(bias.lat));
  url.searchParams.set("lon", String(bias.lon));
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("location_bias_scale", "0.08");
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(1500),
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
        postcode?: string;
        countrycode?: string;
      };
    }[];
  };
  const hits: RankedHit[] = [];
  for (const f of data.features ?? []) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const props = f.properties ?? {};
    const label = formatPhoton(props);
    if (!label) continue;
    hits.push({
      label,
      lat,
      lon,
      name: props.name,
      country: props.countrycode || props.country,
    });
  }
  return hits;
}

async function nominatimSearch(q: string, limit: number): Promise<RankedHit[]> {
  return enqueueNominatim(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "de");
    url.searchParams.set("countrycodes", "ch,li,at,de,it,fr");
    url.searchParams.set("viewbox", "5.9,47.9,10.6,45.8");
    url.searchParams.set("bounded", "0");
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
      name?: string;
      address?: { country?: string; country_code?: string };
    }[];
    const hits: RankedHit[] = [];
    for (const row of rows) {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      hits.push({
        label: row.display_name || row.name || q,
        lat,
        lon,
        name: row.name,
        country: row.address?.country_code || row.address?.country,
      });
    }
    return hits;
  });
}

function escapeOverpassRe(text: string): string {
  return text.replace(/[\\.[\]^$()*+?{}|]/g, "\\$&").replaceAll('"', "");
}

function overpassFilters(namePart: string): string[] {
  const t = namePart.toLowerCase();
  const filters: string[] = [];
  if (/zahnarzt|dentist/.test(t)) {
    filters.push('["amenity"="dentist"]', '["healthcare"="dentist"]');
  }
  if (/\b(arzt|ärztin|doktor)\b/.test(t) && !/zahnarzt/.test(t)) {
    filters.push('["amenity"="doctors"]', '["healthcare"="doctor"]');
  }
  if (/apotheke|pharmacy/.test(t)) filters.push('["amenity"="pharmacy"]');
  if (/restaurant|gasthaus|beiz/.test(t)) filters.push('["amenity"="restaurant"]');
  if (/caf[eé]|kaffee/.test(t)) filters.push('["amenity"="cafe"]');
  if (/hotel|gasthof/.test(t)) filters.push('["tourism"="hotel"]');
  if (/garage|autowerk|werkstatt/.test(t)) filters.push('["shop"="car_repair"]');
  const words = namePart
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((w) => w.length >= 4);
  if (words.length && !filters.length) {
    filters.push(`["name"~"${words.map(escapeOverpassRe).join("|")}",i]`);
  }
  return [...new Set(filters)];
}

async function openMeteoSearch(q: string, limit: number): Promise<RankedHit[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", String(Math.min(20, Math.max(1, limit))));
  url.searchParams.set("language", "de");
  url.searchParams.set("format", "json");
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: {
      name?: string;
      latitude?: number;
      longitude?: number;
      country?: string;
      country_code?: string;
      admin1?: string;
      admin3?: string;
      postcodes?: string[];
    }[];
  };
  const hits: RankedHit[] = [];
  for (const row of data.results ?? []) {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !row.name) continue;
    const city = row.admin3 && row.admin3 !== row.name ? row.admin3 : "";
    const label = [row.name, city, row.admin1, row.country || "Schweiz"].filter(Boolean).join(", ");
    hits.push({
      label,
      lat,
      lon,
      name: row.name,
      country: row.country_code || row.country,
    });
  }
  return hits;
}

async function overpassPois(
  around: { lat: number; lon: number },
  namePart: string,
  radiusM = 14000,
): Promise<RankedHit[]> {
  const filters = overpassFilters(namePart);
  if (!filters.length) return [];
  const body = `
[out:json][timeout:8];
(
${filters.map((f) => `  nwr${f}(around:${radiusM},${around.lat.toFixed(5)},${around.lon.toFixed(5)});`).join("\n")}
);
out center tags 24;
`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ data: body }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    elements?: {
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }[];
  };
  const hits: RankedHit[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = tags.name || tags["name:de"];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !name) continue;
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const city = tags["addr:city"] || tags["addr:place"] || tags["addr:suburb"] || "";
    const label = [name, street, [tags["addr:postcode"], city].filter(Boolean).join(" "), "Schweiz"]
      .filter(Boolean)
      .join(", ");
    hits.push({ label, lat: lat as number, lon: lon as number, name, country: "CH" });
  }
  return hits;
}

function pickLocalityHit(hits: RankedHit[], place: string): RankedHit | undefined {
  const p = place.toLowerCase();
  return hits.find((h) => {
    const name = (h.name || h.label).split(",")[0]?.trim().toLowerCase() ?? "";
    if (name !== p && !name.startsWith(p) && !p.startsWith(name)) return false;
    return haversineKm(HOME, h) < 250 && isSwiss(h.country);
  });
}

async function resolveLocality(q: string): Promise<{ hit: RankedHit; remainder: string } | null> {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const tries = [tokens[tokens.length - 1]];
  if (tokens.length >= 3) tries.unshift(tokens.slice(-2).join(" "));
  for (const place of tries) {
    if (place.length < 3) continue;
    let hits: RankedHit[] = [];
    try {
      hits = await openMeteoSearch(place, 8);
    } catch {
      hits = [];
    }
    if (!hits.length) {
      hits = await limitMs(photonSearch(place, 5, HOME, 7).catch(() => []), 1200, []);
    }
    const local = pickLocalityHit(hits, place);
    if (!local) continue;
    const remainder = q.replace(new RegExp(`\\b${escapeOverpassRe(place)}\\b`, "i"), "").trim();
    if (remainder.length < 3) continue;
    return { hit: local, remainder };
  }
  return null;
}

function scoreHit(hit: RankedHit, q: string, around: { lat: number; lon: number }): number {
  const dist = haversineKm(around, hit);
  const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const hay = hit.label.toLowerCase();
  let score = 40 - dist / 4;
  if (isSwiss(hit.country)) score += 22;
  for (const t of tokens) {
    if (hay.includes(t.toLowerCase())) score += 6;
  }
  if (dist > 80) score -= 25;
  if (dist > 160) score -= 40;
  return score;
}

function dedupeHits(hits: RankedHit[]): RankedHit[] {
  const seen = new Set<string>();
  const out: RankedHit[] = [];
  for (const hit of hits) {
    const key = `${hit.lat.toFixed(4)},${hit.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

async function suggestPlaces(q: string): Promise<PlaceHit[]> {
  const key = `v6:${geoKey(q)}`;
  const cached = suggestCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;

  const locality = await resolveLocality(q).catch(() => null);
  const around = locality?.hit ?? HOME;
  const poiQuery = locality?.remainder || q;
  const hasPoiFilter = overpassFilters(poiQuery).length > 0;

  const tasks: Promise<RankedHit[]>[] = [
    openMeteoSearch(locality?.hit.name || q, 6).catch(() => []),
    limitMs(photonSearch(q, 8, around, locality ? 12 : 8).catch(() => []), 1200, []),
  ];
  if (hasPoiFilter) {
    const radius = locality ? 16000 : 70000;
    tasks.push(overpassPois(around, poiQuery, radius).catch(() => []));
  }
  if (locality) {
    tasks.push(Promise.resolve([locality.hit]));
  }

  let merged = dedupeHits((await Promise.all(tasks)).flat());
  if (!merged.length) {
    merged = await limitMs(nominatimSearch(q, 5).catch(() => []), 2000, []);
  }
  if (locality) {
    const nearby = merged.filter((h) => haversineKm(around, h) <= 40);
    if (nearby.length) merged = nearby;
  }
  merged.sort((a, b) => scoreHit(b, q, around) - scoreHit(a, q, around));
  const data = merged.slice(0, 8).map(({ label, lat, lon }) => ({ label, lat, lon }));
  if (data.length) suggestCache.set(key, { at: Date.now(), data });
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

function shorterLonDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function unwrapRoute(points: MapPoint[]): MapPoint[] {
  if (points.length < 2) return points;
  const a = points[0];
  const b = points[1];
  return [a, { ...b, lon: a.lon + shorterLonDelta(a.lon, b.lon) }];
}

function arcControl(
  a: { x: number; y: number },
  b: { x: number; y: number },
  outH: number,
): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const bulge = Math.min(len * 0.18, outH * 0.22);
  return {
    x: (a.x + b.x) / 2 - (dy / len) * bulge,
    y: (a.y + b.y) / 2 + (dx / len) * bulge,
  };
}

function routeBBox(
  pts: { x: number; y: number }[],
  outW: number,
  outH: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const a = pts[0];
  const b = pts[1];
  const c = arcControl(a, b, outH);
  const padX = Math.max(72, outW * 0.1);
  const padY = Math.max(80, outH * 0.14);
  return {
    minX: Math.min(a.x, b.x, c.x) - padX,
    maxX: Math.max(a.x, b.x, c.x) + padX,
    minY: Math.min(a.y, b.y, c.y) - padY,
    maxY: Math.max(a.y, b.y, c.y) + padY,
  };
}

function fitZoom(points: MapPoint[], outW: number, outH: number, tilePx: number): number {
  for (let z = 12; z >= 2; z--) {
    const pts = points.map((p) => worldPx(p.lat, p.lon, z, tilePx));
    const box = routeBBox(pts, outW, outH);
    if (box.maxX - box.minX <= outW && box.maxY - box.minY <= outH) return z;
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
  const framed = points.length >= 2 ? unwrapRoute(points) : points;
  const key = `voyager@2x,fit3,${framed.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)},${p.label ?? ""}`).join("|")},${w}x${h}`;
  const hit = imgCache.get(key);
  if (hit && Date.now() - hit.at < IMG_TTL) return { body: hit.body, type: hit.type };

  const scale = 2;
  const tilePx = 256 * scale;
  const outW = w * scale;
  const outH = h * scale;
  const route = framed.length >= 2;
  const zoom = route ? fitZoom(framed, outW, outH, tilePx) : 16;
  const pts = framed.map((p) => worldPx(p.lat, p.lon, zoom, tilePx));
  let left: number;
  let top: number;
  if (route) {
    const box = routeBBox(pts, outW, outH);
    left = (box.minX + box.maxX) / 2 - outW / 2;
    top = (box.minY + box.maxY) / 2 - outH / 2;
  } else {
    left = pts[0].x - outW / 2;
    top = pts[0].y - outH / 2;
  }
  const images = await stitchTiles(zoom, left, top, outW, outH, tilePx);

  let overlay = "";
  if (route) {
    const a = { x: pts[0].x - left, y: pts[0].y - top };
    const b = { x: pts[1].x - left, y: pts[1].y - top };
    const c = arcControl(a, b, outH);
    const mid = quadPoint(0.55, a.x, a.y, c.x, c.y, b.x, b.y);
    const near = quadPoint(0.62, a.x, a.y, c.x, c.y, b.x, b.y);
    const angle = (Math.atan2(near.y - mid.y, near.x - mid.x) * 180) / Math.PI;
    overlay = `
      <path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}" fill="none" stroke="#1d4ed8" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round" opacity="0.92"/>
      ${planeSvg(mid.x, mid.y, angle)}
      ${airportDotSvg(a.x, a.y, framed[0].label ?? "A")}
      ${airportDotSvg(b.x, b.y, framed[1].label ?? "B")}
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

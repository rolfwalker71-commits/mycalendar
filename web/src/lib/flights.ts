export type FlightRoute = { from: string; to: string };

const IATA_PAIR =
  /\b([A-Za-z]{3})\s*(?:→|->|–|—|−|-|to|nach)\s*([A-Za-z]{3})\b/i;

const VON_NACH = /von\s+([^,\n]+?)\s+nach\s+([^,\n]+)/i;

export function parseFlightRoute(
  location?: string | null,
  summary?: string | null,
): FlightRoute | null {
  const blobs = [location, summary].filter(Boolean).join(" ");
  const iata = blobs.match(IATA_PAIR);
  if (iata && iata[1] !== iata[2]) {
    return { from: iata[1].toUpperCase(), to: iata[2].toUpperCase() };
  }
  const named = blobs.match(VON_NACH);
  if (named && /flug|airport|abflug|boarding/i.test(blobs)) {
    const from = named[1].trim();
    const to = named[2].trim();
    if (from.length >= 3 && to.length >= 3 && from.toLowerCase() !== to.toLowerCase()) {
      return { from, to };
    }
  }
  return null;
}

export function isIataCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

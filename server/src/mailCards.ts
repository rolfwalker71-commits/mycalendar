export type HighlightCard = {
  type: string;
  title: string;
  lines: string[];
};

const TYPE_LABEL: Record<string, string> = {
  FlightReservation: "Flug",
  LodgingReservation: "Unterkunft",
  EventReservation: "Reservierung",
  FoodEstablishmentReservation: "Restaurant",
  RentalCarReservation: "Mietwagen",
  TrainReservation: "Zug",
  BusReservation: "Bus",
  Order: "Bestellung",
  Invoice: "Rechnung",
  ParcelDelivery: "Sendung",
  PackageTracking: "Sendung",
  EmailMessage: "Hinweis",
};

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "name" in value) {
    return asString((value as { name?: unknown }).name);
  }
  if (Array.isArray(value)) return value.map(asString).filter(Boolean).join(", ");
  return "";
}

function cardFrom(item: Record<string, unknown>): HighlightCard | null {
  const rawType = asString(item["@type"]).split("/").pop() ?? "";
  const type = TYPE_LABEL[rawType];
  if (!type) return null;
  const reservation = (item.reservationFor ?? item.acceptedOffer ?? item.broker) as
    | Record<string, unknown>
    | undefined;
  const title =
    asString(item.name) ||
    asString(reservation?.name) ||
    asString((reservation as { departureAirport?: unknown } | undefined)?.departureAirport) ||
    type;
  const lines: string[] = [];
  const start = asString(item.startDate) || asString(item.pickupTime) || asString(item.bookingTime);
  const end = asString(item.endDate) || asString(item.dropoffTime);
  if (start) lines.push(end ? `${start} – ${end}` : start);
  const from =
    asString((reservation as { departureAirport?: unknown } | undefined)?.departureAirport) ||
    asString((reservation as { departureStation?: unknown } | undefined)?.departureStation);
  const to =
    asString((reservation as { arrivalAirport?: unknown } | undefined)?.arrivalAirport) ||
    asString((reservation as { arrivalStation?: unknown } | undefined)?.arrivalStation);
  if (from || to) lines.push([from, to].filter(Boolean).join(" → "));
  const loc =
    asString((item.reservationFor as { address?: unknown } | undefined)?.address) ||
    asString(item.location);
  if (loc) lines.push(loc);
  const conf = asString(item.reservationNumber) || asString(item.orderNumber) || asString(item.confirmationNumber);
  if (conf) lines.push(`Nr. ${conf}`);
  const under = asString(item.underName);
  if (under) lines.push(under);
  const desc = asString(item.description);
  if (desc) lines.push(desc.slice(0, 180));
  return { type, title: title || type, lines: [...new Set(lines)].filter(Boolean).slice(0, 5) };
}

function walk(value: unknown, out: HighlightCard[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out);
    return;
  }
  if (typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  const card = cardFrom(rec);
  if (card) out.push(card);
  if (rec["@graph"]) walk(rec["@graph"], out);
}

export function extractHighlightCards(html: string): HighlightCard[] {
  if (!html) return [];
  const out: HighlightCard[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      walk(JSON.parse(match[1]), out);
    } catch {
      /* ignore broken json-ld */
    }
  }
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.type}:${c.title}:${c.lines.join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

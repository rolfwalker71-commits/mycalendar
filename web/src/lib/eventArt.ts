export type EventArtKind =
  | "birthday"
  | "vacation"
  | "meal"
  | "coffee"
  | "flight"
  | "train"
  | "car"
  | "hotel"
  | "doctor"
  | "sport"
  | "swim"
  | "ski"
  | "hike"
  | "celebration"
  | "wedding"
  | "concert"
  | "movie"
  | "christmas"
  | "easter"
  | "carnival"
  | "national"
  | "ooo"
  | "hair"
  | "school"
  | "baby"
  | "pet"
  | "moving"
  | "package"
  | "date"
  | "shopping"
  | "spa"
  | "garden"
  | "camping"
  | "boat"
  | "wine"
  | "grill"
  | "sleep"
  | "photo"
  | "work"
  | "kids"
  | "legal"
  | "money"
  | "call"
  | "dance"
  | "game"
  | "repair"
  | "church"
  | "museum";

type Rule = { kind: EventArtKind; words: string[] };

/** Spezifischere Treffer zuerst. */
export const EVENT_ART_RULES: Rule[] = [
  { kind: "birthday", words: ["geburtstag", "birthday", "bday", "geburi"] },
  {
    kind: "christmas",
    words: ["weihnachten", "christmas", "advent", "nikolaus", "samichlaus"],
  },
  { kind: "easter", words: ["ostern", "easter", "karfreitag"] },
  {
    kind: "carnival",
    words: ["fasnacht", "fastnacht", "karneval", "carnival", "halloween"],
  },
  {
    kind: "national",
    words: ["bundesfeier", "nationalfeiertag", "1. august", "1 august"],
  },
  { kind: "wedding", words: ["hochzeit", "wedding", "trauung", "polterabend"] },
  { kind: "baby", words: ["taufe", "babyshower", "wochenbett", "hebamme"] },
  {
    kind: "date",
    words: ["valentinstag", "jahrestag", "anniversary", "date night", "verlobung"],
  },
  { kind: "concert", words: ["konzert", "concert", "orchester", "chorprobe"] },
  { kind: "movie", words: ["kino", "filmabend", "netflix", "cinema", "movie"] },
  { kind: "dance", words: ["tanzstunde", "tanzen", "ballet", "ballett"] },
  { kind: "game", words: ["spieleabend", "boardgame", "zocken", "gaming"] },
  { kind: "photo", words: ["fotoshooting", "fototermin", "shooting"] },
  { kind: "museum", words: ["museum", "ausstellung", "galerie", "zoo", "aquarium"] },
  { kind: "church", words: ["gottesdienst", "kirche", "andacht"] },
  { kind: "hair", words: ["coiffeur", "coiffeuse", "friseur", "haarschnitt", "nagelstudio"] },
  { kind: "spa", words: ["massage", "sauna", "wellness", "spa"] },
  { kind: "swim", words: ["schwimmen", "hallenbad", "schwimmbad", "badi"] },
  { kind: "ski", words: ["skifahren", "skitag", "snowboard", "skiurlaub"] },
  { kind: "hike", words: ["wanderung", "wandern", "bergtour", "hoehenweg"] },
  { kind: "camping", words: ["camping", "zeltlager", "biwak"] },
  { kind: "boat", words: ["segeln", "schiff", "bootstour", "schifffahrt"] },
  { kind: "garden", words: ["garten", "gaertnern", "pflanzung"] },
  { kind: "grill", words: ["grillieren", "grillen", "barbecue", "bbq"] },
  { kind: "wine", words: ["weindegustation", "weinprobe", "tasting"] },
  { kind: "coffee", words: ["kaffee", "coffee", "cafe", "cappuccino"] },
  {
    kind: "meal",
    words: [
      "mittagessen",
      "abendessen",
      "fruehstueck",
      "breakfast",
      "restaurant",
      "kochabend",
      "brunch",
      "dinner",
      "lunch",
      "fondue",
      "raclette",
      "pizza",
      "sushi",
      "apero",
      "zmorge",
      "zmittag",
      "znacht",
      "essen",
    ],
  },
  { kind: "flight", words: ["flughafen", "airport", "abflug", "boarding", "flug"] },
  { kind: "train", words: ["bahnhof", "zugfahrt", "sbb"] },
  { kind: "car", words: ["mfk", "garage", "autowerkstatt", "tanken", "fahrstunde"] },
  { kind: "hotel", words: ["check-in", "checkin", "hotel", "uebernachtung"] },
  {
    kind: "doctor",
    words: [
      "zahnarzt",
      "zahnarztin",
      "spital",
      "hospital",
      "apotheke",
      "physio",
      "impfung",
      "therapie",
      "aerztin",
      "arzt",
      "dentist",
      "doctor",
    ],
  },
  {
    kind: "sport",
    words: [
      "training",
      "fitness",
      "fussball",
      "tennis",
      "jogging",
      "kraftraum",
      "yoga",
      "pilates",
      "gym",
      "velo",
      "bike",
      "sport",
    ],
  },
  {
    kind: "vacation",
    words: ["staedtereise", "ferien", "urlaub", "vacation", "holiday", "ausflug", "strand"],
  },
  { kind: "ooo", words: ["abwesenheit", "ausser haus", "krankheitstag", "krank"] },
  {
    kind: "celebration",
    words: ["silvester", "neujahr", "jubilaeum", "party", "feier", "fest"],
  },
  { kind: "school", words: ["elternabend", "pruefung", "vorlesung", "schule", "seminar"] },
  { kind: "kids", words: ["spielgruppe", "kindergarten", "kita", "hort"] },
  { kind: "pet", words: ["tierarzt", "gassi", "hundeschule", "hund", "katze"] },
  { kind: "moving", words: ["umzug", "einzug", "auszug"] },
  { kind: "package", words: ["paket", "lieferung", "postfiliale", "dhl"] },
  { kind: "shopping", words: ["einkaufen", "shopping", "ikea", "markt"] },
  { kind: "sleep", words: ["schlafen", "mittagsschlaf", "power nap"] },
  { kind: "work", words: ["offsite", "workshop", "konferenz", "kickoff"] },
  { kind: "legal", words: ["notar", "anwalt", "gemeinde", "passbuero"] },
  { kind: "money", words: ["steuer", "treuhaender", "versicherung", "banktermin"] },
  { kind: "call", words: ["telefonat", "rueckruf"] },
  { kind: "repair", words: ["handwerker", "sanitaer", "elektriker", "reparatur"] },
];

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function hasWord(haystack: string, word: string): boolean {
  const needle = fold(word).trim();
  if (!needle) return false;
  if (needle.includes(" ")) return haystack.includes(needle);
  if (needle.length >= 6) return haystack.includes(needle);
  return new RegExp(`[^a-z0-9]${needle}[^a-z0-9]`).test(` ${haystack} `);
}

export function eventArtKind(input: {
  summary?: string | null;
  description?: string | null;
  calendarSummary?: string | null;
  eventType?: string | null;
}): EventArtKind | null {
  if (input.eventType === "outOfOffice") return "ooo";
  if (input.eventType === "focusTime") return "work";
  const text = fold(
    [input.summary, input.calendarSummary, input.description?.slice(0, 180)]
      .filter(Boolean)
      .join(" "),
  );
  if (!text.trim()) return null;
  if (/geburtstag/.test(fold(input.calendarSummary || ""))) return "birthday";
  for (const rule of EVENT_ART_RULES) {
    if (rule.words.some((word) => hasWord(text, word))) return rule.kind;
  }
  return null;
}

const ART_FILE: Record<EventArtKind, string> = {
  birthday: "birthday",
  vacation: "vacation",
  ooo: "vacation",
  hotel: "vacation",
  camping: "vacation",
  boat: "vacation",
  swim: "vacation",
  garden: "vacation",
  meal: "meal",
  grill: "meal",
  wine: "meal",
  coffee: "coffee",
  flight: "flight",
  train: "train",
  car: "car",
  doctor: "doctor",
  sport: "sport",
  game: "sport",
  dance: "sport",
  ski: "ski",
  hike: "ski",
  wedding: "wedding",
  date: "wedding",
  celebration: "celebration",
  carnival: "celebration",
  national: "celebration",
  kids: "celebration",
  baby: "celebration",
  christmas: "christmas",
  easter: "christmas",
  work: "work",
  school: "work",
  legal: "work",
  money: "work",
  call: "work",
  photo: "work",
  sleep: "work",
  church: "work",
  museum: "work",
  pet: "pet",
  spa: "spa",
  hair: "spa",
  concert: "concert",
  movie: "concert",
  shopping: "shopping",
  moving: "shopping",
  package: "shopping",
  repair: "shopping",
};

export function eventArtSrc(
  kind: EventArtKind,
  variant: "side" | "header",
): string {
  return `/event-art/${ART_FILE[kind]}-${variant}.jpg`;
}

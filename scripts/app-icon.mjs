// App-Icon als Vektor. Daraus entstehen alle PNG-Größen (scripts/generate-icons.mjs).
// Kein Datum im Icon: iOS merkt sich das Icon beim Hinzufügen zum Home-Bildschirm,
// es kann sich nicht täglich ändern. Die Tageszahl zeigen das Logo in der App
// (web/src/lib/appMark.ts) und die Widgets.

export const ICON_RED = "#E0241B";
export const ICON_RED_LIGHT = "#FF453A";
export const ICON_RED_DEEP = "#A8140E";
export const ICON_INK = "#1C1C1E";

function palette(dark) {
  return {
    paper: dark ? "#F5F5F7" : "#FFFFFF",
    card: dark ? "#E9E9EE" : "#F2F2F7",
    cardEdge: dark ? "#C9C9D2" : "#D8D8E0",
    ink: dark ? "#0B0B0F" : ICON_INK,
    line: dark ? "#B6B6C0" : "#C2C2CC",
  };
}

/**
 * Kalenderblatt mit dunklem Kopf; im Körper ein Kuvert mit offener Klappe,
 * aus dem ein Zettel schaut. Mit `day` trägt der Zettel die Tageszahl.
 */
function open({ dark = false, day = null } = {}) {
  const c = palette(dark);
  const n = day == null ? null : String(Math.min(31, Math.max(1, Math.round(day))));
  const numeral = n && n.length > 1 ? 118 : 138;
  return `
  <rect x="182" y="150" width="660" height="724" rx="104" fill="${c.paper}"/>
  <path d="M182 254a104 104 0 0 1 104-104h452a104 104 0 0 1 104 104v92H182z" fill="${c.ink}"/>
  <circle cx="336" cy="250" r="30" fill="${c.paper}"/>
  <circle cx="688" cy="250" r="30" fill="${c.paper}"/>
  <g filter="url(#soft)">
    <rect x="286" y="470" width="452" height="300" rx="48" fill="${ICON_RED_DEEP}"/>
    <rect x="352" y="388" width="320" height="250" rx="34" fill="${c.card}"/>
    ${
      n
        ? `<text x="512" y="566" text-anchor="middle" fill="${ICON_INK}"
              font-family="ui-rounded, -apple-system, system-ui, sans-serif"
              font-size="${numeral}" font-weight="800">${n}</text>`
        : `<rect x="392" y="438" width="240" height="22" rx="11" fill="${c.cardEdge}"/>
           <rect x="392" y="490" width="176" height="22" rx="11" fill="${c.line}"/>`
    }
    <path d="M286 518v198c0 27 21 48 48 48h356c27 0 48-21 48-48V518L512 668z" fill="${ICON_RED}"/>
  </g>`;
}

/** Alternative: das Blatt knickt unten selbst zum Kuvert. */
function fold({ dark = false } = {}) {
  const c = palette(dark);
  return `
  <g filter="url(#soft)">
    <rect x="182" y="150" width="660" height="724" rx="104" fill="${c.paper}"/>
    <path d="M182 254a104 104 0 0 1 104-104h452a104 104 0 0 1 104 104v92H182z" fill="${c.ink}"/>
    <circle cx="336" cy="250" r="30" fill="${c.paper}"/>
    <circle cx="688" cy="250" r="30" fill="${c.paper}"/>
    <rect x="286" y="404" width="300" height="24" rx="12" fill="${c.cardEdge}"/>
    <rect x="286" y="470" width="220" height="24" rx="12" fill="${c.card}"/>
    <path d="M182 560h660v210a104 104 0 0 1-104 104H286a104 104 0 0 1-104-104z" fill="${c.card}"/>
    <path d="M182 560 512 786 842 560" fill="none" stroke="${ICON_RED}" stroke-width="34" stroke-linejoin="round"/>
  </g>`;
}

const VARIANTS = { open, fold };

export const ICON_VARIANTS = Object.keys(VARIANTS);

/** Standard; über APP_ICON_VARIANT=fold umstellbar. */
export const DEFAULT_ICON_VARIANT = "open";

export function iconDefs() {
  return `
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ICON_RED_LIGHT}"/>
      <stop offset="1" stop-color="${ICON_RED}"/>
    </linearGradient>
    <filter id="soft" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="rgba(0,0,0,0.22)"/>
    </filter>`;
}

/** Icon-Inhalt ohne Hintergrund — für das Logo in der App wiederverwendet. */
export function appIconBody(variant = DEFAULT_ICON_VARIANT, options = {}) {
  const draw = VARIANTS[variant] ?? open;
  return draw(options);
}

export function appIconSvg(variant = DEFAULT_ICON_VARIANT, options = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>${iconDefs()}</defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${appIconBody(variant, options)}
</svg>`;
}

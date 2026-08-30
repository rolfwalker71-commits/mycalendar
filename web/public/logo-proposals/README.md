# Logo proposals — Kalender & Mail

In use: proposal **A** — `/logo.png` (light) and `/logo-dark.png` (dark). PWA icons come from `logo-proposal-a-source.png`.

## Directions

| ID | Concept | Files |
|----|---------|--------|
| **A** (recommended) | Apple Calendar–style date tile (`30`) + small mail badge | `logo-proposal-a-{light,dark,source}.png` |
| B | Coral “KM” monogram tile with calendar ticks | `logo-proposal-b-km-{light,dark}.png` |
| C | Single fused tile: red header + grid, mail flap as a cell | `logo-proposal-c-fused-{light,dark}.png` |

Accent is coral/Apple red (`#FF3B30`), not periwinkle — matches the app’s light gray / charcoal UI.

## Adopt proposal A (or another) into the icon pipeline

`scripts/generate-icons.mjs` reads `web/public/logo-source.png`, knocks out edge white, writes `logo.png` plus PWA icons (`icon-192/512`, maskable, `apple-touch-icon`).

```bash
# After you pick a proposal — example for A:
cp web/public/logo-proposals/logo-proposal-a-source.png web/public/logo-source.png
node scripts/generate-icons.mjs
```

Requirements for a good source:

- Square **1024×1024** PNG (A source already is)
- Mark on **white** (or transparent); the script flood-fills near-white from the edge
- Mark ~**70%** of the canvas so maskable icons keep safe padding

## In-app header (light / dark)

Today `AppLogo` always loads `/logo.png`. For adaptive marks:

- Keep cutout light mark as `/logo.png` (works on light header)
- Optionally add `/logo-dark.png` from `logo-proposal-a-dark.png` (cut out bg if needed) and switch with `className="dark:hidden"` / `hidden dark:block`, or a single CSS-friendly SVG later

Do not point `logo-source.png` at a dark-background plate — maskable/apple-touch expect a light opaque pad from the script.

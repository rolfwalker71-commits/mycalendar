# Fluent 2 (Windows desktop)

Apply when `data-chrome="desktop"` — this app’s **lg+** and Windows-PC look.

## Surfaces

- Application: `#f3f3f3` / `#202020` (not iOS `#fafafa` / `#1c1c1e`).
- Content cards: opaque `#ffffff` / `#2c2c2c` with **1px** stroke (`ring-border`).
- Chrome (header, docks if any): mica — `backdrop-filter: blur(1.25rem) saturate(1.4)` and `color-mix` / `bg-card/80`.
- No Material tonal purple wash on desktop.

## Shape & density

- Control radius **4px**; surface radius **8px** (`--radius: 0.375rem`).
- Compact list rows and command buttons. Do not use 28dp squircles or 64dp FABs.
- Selected nav: **2px accent** at the bottom (or left on a rail), `bg-primary/10`.

## Type & accent

- `"Segoe UI Variable", "Segoe UI", system-ui`.
- Accent `#005fb8` (light) / `#60cdff` (dark). Today/destructive stay red family (`#c42b1c`).
- Focus: 2px accent outline, not a thick iOS ring.

## Layout

- Bottom module docks stay `lg:hidden`. Desktop uses the header switcher + side rail.
- Dialogs centered, `rounded-md`, smoke overlay `bg-black/20`.
- Prefer a right-hand tasks rail (already in `App.tsx`) over stacking mobile docks.

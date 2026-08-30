---
name: material-you-3-expressive
description: >-
  Applies Material You 3 Expressive (Android) and Fluent 2 (Windows) to UI work.
  Use when designing or changing UI, UX, CSS, components, docks, cards, dialogs,
  FABs, navigation, or when the user mentions Material You, MY3, M3 Expressive,
  Android chrome, Windows Fluent, or this calendar/mail app's look.
---

# Material You 3 Expressive + Fluent 2

This app’s product look is **Android Material You 3 Expressive** on phones and **Windows Fluent 2** on desktop. Do **not** apply the old iOS island skill (`uiux-design`) unless the user explicitly asks for the iOS preview.

For the delta vs that old skill, see [vs-uiux.md](vs-uiux.md). For Fluent details, see [fluent-windows.md](fluent-windows.md).

## Which chrome

`document.documentElement.dataset.chrome` is `android` | `desktop` | `ios`.

| Preference | Result |
|---|---|
| `auto` (default) | `<lg` → Android MY3E, `lg+` → Windows Fluent |
| `android` / `desktop` / `ios` | Forced preview |

Default detection must **not** pick iOS on iPhone. New users get `auto`. Keep `ios` only as an optional comparison.

Helpers: `web/src/lib/platform.ts` (`listTileClass`, `dockBarClass`, `fabClass`, `fabClearance`, `panelClass`). Tokens live in `web/src/index.css` under `html[data-chrome="android"]` and `html[data-chrome="desktop"]`.

## Material You 3 Expressive (Android)

Not Material 2. Not 2023 M3 “baseline only”. Expressive means **more color, larger shapes, tonal surfaces, pill indicators, spring-like motion**.

### Color

- Roles: `primary`, `on-primary`, `primary-container` (`--secondary` here), `surface` (`--background`), `surface-container`, `outline` (`--border`).
- **Tonal elevation**, not drop shadows. Cards sit on `surface-container` / `--card` with **no** `shadow-lg`.
- Light/dark follows the app theme (`system` = device). Wallpaper dynamic color is **not** available in this PWA — keep the seeded purple palette (`#6750a4` / `#d0bcff`).
- Do not fall back to iOS grays (`#1d1d1f`, `#f2f2f7`) while chrome is android.

### Shape

- Cards / dialogs: **24–28dp** (`rounded-3xl` / `1.75rem`).
- FAB: **28dp squircle** (`rounded-[1.75rem]`), not a circle.
- Nav indicator: **full pill** behind the icon only.
- Chips / filled buttons: extra-round (`rounded-full` or `1.25rem`).
- No iOS floating `rounded-2xl` dock islands.

### Navigation

- **Flush NavigationBar** (`border-t` optional, edge-to-edge `surface-container`). Never a floating inset island.
- 3–5 destinations. Active: tonal pill (`bg-secondary text-primary`) **around the icon**, label under it in `primary`.
- Idle: muted icon + label, no cell fill.
- Item hit: **56–64dp** (`min-h-16`).
- Two bars (calendar + modules) stack flush, `gap-0`, only `safe-area-inset-bottom`.
- `lg+` hides the bottom bars (desktop uses Fluent chrome).
- Large screens: prefer a nav rail / side rail, not a bottom bar.

### FAB

- One primary action. Size **64dp** (`size-16`), squircle, `primary` fill.
- Sit above the nav: `fabClearance(chrome, docks)`.
- No iOS circle + heavy shadow.

### Lists & cards

- Inset cards, gap between items, `rounded-3xl`, **no** hairline-ring-as-iOS-shadow.
- Selected: `primary` / `secondary` fill, not a harsh rectangular outline.
- Swipe actions behind the card; clip with the same radius. Opaque rest/hover (`bg-muted`, no alpha).
- Primary labels wrap (`break-words`, `leading-snug`). Never `truncate` a title when width remains.

### App bars & sheets

- Top bar: `surface-container`, **no** iOS hairline fetish. Icons 48dp.
- Dialogs: 28dp corners, tonal surface.
- Bottom sheets: `rounded-t-3xl`, drag affordance, spring-ish ease (`cubic-bezier(0.2, 0, 0, 1)`), not `ease-in-out` on surfaces.

### Type & motion

- Keep **rem** type (never `px` font-size). Root stays `font-size: calc(100% * var(--app-font-scale))`.
- Font stack: Roboto / Roboto Flex / `system-ui` (on Android that *is* Roboto).
- Emphasized titles: heavier weight, slightly larger tracking-tight.
- Motion: short, emphasized deceleration. Do not use Material 2 `FastOutSlowIn` as the default on MY3E chrome.

### Touch

- Isolated controls: **48dp** (`min-h-12`) on Android. 40dp (`min-h-10`) only inside a compact track.
- Segmented / view switcher: tonal track + filled active (primary or secondary-container), not an iOS white pill on grey.

## Windows Fluent 2 (desktop)

Apply when `data-chrome="desktop"` (auto on `lg+`).

- Radius **4–8px** (`--radius: 0.375rem`). No 28dp squircles.
- Surfaces: mica-ish (`backdrop-blur`, `bg-card/80`), layer `background #f3f3f3` / `#202020`.
- Accent: `#005fb8` / `#60cdff`. Selected nav: **2px accent line**, not a Material pill.
- Density: compact (`min-h-11` ok, FAB `size-12 rounded-md`).
- Font: `"Segoe UI Variable", "Segoe UI", system-ui`.
- Cards: thin stroke, no Material tonal purple, no iOS shadow.
- Command-style headers; no bottom docks (`lg:hidden`).

## Keep from the old skill

These stay — they are a11y/engineering, not iOS chrome:

- WCAG 2.1 AA contrast.
- Semantic HTML, keyboard, focus rings (`ring-ring`).
- Rem type; no `text-[13px]`.
- Date/time Safari rule: hide WebKit chrome only when `[data-empty="true"]:not(:focus)`.
- Never `color: transparent` on live input.
- Opaque layers over swipe actions.
- Do not clip primary labels.

## Do not

- Do not pin an iOS floating dock when chrome is android/desktop.
- Do not use `shadow-lg shadow-black/10 ring-1` as the default card (that is the old island card).
- Do not treat `uiux-design` floating-dock / detached-card rules as source of truth for this app.
- Do not invent wallpaper-based dynamic color in the PWA.

## Checklist before finishing UI work

- [ ] Chrome is `auto` unless the user is comparing.
- [ ] Narrow view looks MY3E (pills, tonal, flush nav, squircle FAB).
- [ ] `lg+` looks Fluent (mica, accent line, small radius).
- [ ] Light and dark both work.
- [ ] Titles wrap; no truncated subjects in headers.
- [ ] Rebuild web (`npm run build:web`) if the user is on `npm start`.

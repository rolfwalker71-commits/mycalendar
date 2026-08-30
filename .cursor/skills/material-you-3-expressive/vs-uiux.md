# Delta: `uiux-design` (iOS) → Material You 3 Expressive / Fluent

Use this when porting a screen that still follows the old skill.

| Old `uiux-design` rule | Why it is wrong here | Do this instead |
|---|---|---|
| Floating dock: inset, `rounded-2xl`, shadow + ring | iOS Home-Screen / island chrome | **Android:** flush `NavigationBar`, `surface-container`, pill on the **icon**. **Windows:** no bottom dock; command header / accent line |
| Active dock: `rounded-xl bg-muted` on the whole cell | iOS selected segment | **Android:** `rounded-full` pill behind icon only, label `text-primary`. **Windows:** 2px accent underline |
| Dock hit `min-h-11` (44pt) | iOS HIG | **Android:** 56–64dp (`min-h-16`). **Windows:** `min-h-12` compact |
| Safe-area padding on all sides of a floating island | iOS home indicator + inset | **Android:** only `safe-area-inset-bottom` on a flush bar. **Windows:** none |
| Detached list cards: `rounded-2xl` + `shadow-lg` + `ring-1` | iOS inset grouped list | **Android:** `rounded-3xl`, tonal, **no** drop shadow. **Windows:** `rounded-md` + thin stroke |
| “Never pin a full-width flush bar” | Directly contradicts M3 NavigationBar | Flush bar **is** correct on Android |
| “On mobile PWAs prefer a floating bottom dock” | iOS PWA pattern | Prefer M3 NavigationBar / rail |
| Segmented control: muted track + **white elevated pill** | iOS `UISegmentedControl` | **Android:** tonal track + **primary/secondary-container** active (more color). **Windows:** underline / pivot, not a pill track |
| Track `h-10 p-0.5 rounded-full` as the only approved chip | Fine as a *shape*, wrong *colors* | Keep the geometry; restyle fills via `data-chrome` |
| FAB `rounded-full` + `shadow-lg` | iOS / old M3 | **Android:** `size-16 rounded-[1.75rem]`. **Windows:** `size-12 rounded-md` |
| Dialog `rounded-xl` + `ring-1` | Neutral shadcn | **Android:** `rounded-[1.75rem]`, no heavy ring. **Windows:** `rounded-md` |
| Sheet `rounded-t-2xl` | Close, a bit tight | **Android:** `rounded-t-3xl` + drag notch. **Windows:** centered dialog, not a sheet |
| Brand-agnostic grey primary | iOS label color | **Android:** seeded purple primary. **Windows:** `#005fb8` / `#60cdff` |

Unchanged (copy these forward): rem type, WCAG, date/time focus rule, no clipped titles, opaque swipe rows, Lucide icons.

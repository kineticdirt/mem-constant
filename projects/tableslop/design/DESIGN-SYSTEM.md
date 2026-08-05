# tableslop design system (Primavera / Isla Primavera)

HUD display name: **Isla Primavera** only (platform = tableslop).

## Color tokens

| Token | Hex | Use |
|-------|-----|-----|
| `--void` | `#0d0221` | Deepest background |
| `--panel` | `#16082a` | Sidebar, cards |
| `--line` / `--pink` | `#ff71ce` | Primary accent, borders |
| `--cyan` | `#01cdfe` | Links, focus, secondary accent |
| `--purple` | `#b967ff` | Town pins, tertiary |
| `--sun` | `#fffb96` | Capital, warnings, active emphasis |
| `--magenta` | `#ff006e` | Pin gradients |
| `--text` | `#e8f4ff` | Body |
| `--muted` | `#9d8fc9` | Meta, hints |

Glows: `--glow-pink`, `--glow-cyan` (rgba shadows, not extra colors).

## Typography

| Role | Font | Usage |
|------|------|--------|
| Brand / section heads | **Orbitron** 500–700 | HUD brand, journal h2, lane badges |
| Display / pins | **VT323** | Setting name, pin numbers, tooltips |
| Body / UI | **Share Tech Mono** | Cards, notes, controls |

## Pin & label semantics

| `type` | Pin style | Label color |
|--------|-----------|-------------|
| `capital` | Gold gradient | `--sun` |
| `city` | Pink gradient | `--pink` |
| `town` | Purple gradient | `--purple` |
| `preserve` | Cyan gradient | `--cyan` |
| `region` | Grey gradient | `#ccc` |

## Workflow lanes (from `manifest.json`)

`planning` · `writing` · `testing` · `blocked` · `done` · `deferred` — each maps to a `.lane--*` chip on region cards.

## Components

- **HUD** — brand, setting title, layer toggles (labels/areas/cities), edit/save, auth slot
- **Map viewport** — pan/zoom camera, zoom chrome, hint line
- **Legend grid** — R1–R14 quick focus (7-column grid)
- **Region list** — scrollable cards with lane badge
- **Region detail** *(design preview)* — slide-over panel: lore excerpt, coords, notes, Discord CTA placeholder
- **Pilot panel** — local profile stats + session notes

## Motion

- Shimmer on brand/setting (respect `prefers-reduced-motion`)
- Card stagger on list load
- Detail panel: `translateX` 280ms ease-out

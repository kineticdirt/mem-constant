# tableslop layout — zones & responsive

## Desktop (≥801px)

```text
┌─────────────────────────────────────────────────────────────┐
│ HUD: tableslop │ Isla Primavera │ toggles │ auth            │
├───────────────────────────────┬─────────────────────────────┤
│                               │ Pilot (profile + stats)     │
│         MAP VIEWPORT          │ Legend R1–R14               │
│    (pan/zoom, pins, labels)   │ Region list OR detail panel │
│                               │  ← journal column ~300px    │
└───────────────────────────────┴─────────────────────────────┘
```

**Journal column** has two stacked views (not separate routes):

1. **Browse** — legend + region card list (default)
2. **Detail** — opens when a region is selected; back button returns to browse

Detail does not replace the map; it overlays the journal column only.

## Mobile (≤800px)

```text
┌─────────────────────────┐
│ HUD (wrap)              │
├─────────────────────────┤
│ MAP (min 50vh)          │
├─────────────────────────┤
│ Journal: list / detail  │
└─────────────────────────┘
```

Single column: map first, journal below. Detail panel is full-width sheet (no horizontal slide).

## Next features (design preview implements ①)

| # | Feature | Manifest task |
|---|---------|---------------|
| ① | Region detail panel | mv-03, rc-02 |
| ② | Discord deep link button | rc-03, md-03 |
| ③ | Character chips on detail | cl-03 |
| ④ | Lazy lore fetch `/api/region/:id` | up-05 |

## Local vs production

| | Local preview | Production server |
|---|---------------|-------------------|
| Map data | `mock-map.json` + repo PNG path | `/api/map` + deployed assets |
| Auth | Fake “@guest” | Discord OAuth optional |
| Tiles | Single 2K/4K image | Tile pyramid when ready |

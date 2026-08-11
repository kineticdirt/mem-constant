# Highways as template → components (cup model) — 2026-08-10

**Holder:** `tableslop-hwy-template-trace`  
**Analogy:** Blender cup — photo/render in the background is the **guide**; the mesh you build is the **product**. Same here.

## Mental model (locked)

| Layer | Role |
|-------|------|
| Green (+ black-dot) lines on terrain art | **Template / reference only** — do not treat as finished map chrome |
| `map/highways.json` polylines | **Built components** — Freeway / highway / spur graph (GMaps-style product) |
| Map HUD render | Draw **components** (casing + yellow/road fill + shields), which must **follow the template** (traced verts), not invent shortcuts |
| City pins / `regions-ui.json` | Untouched |

Wrong paths we already hit:

1. Thick yellow **proposal** strokes that ignored the green guide → looked ugly / “shifted.”
2. Treating green art **as** the finished roads and removing all component chrome → nothing to “build” toward.

## Goal

Trace the green template into editable road components, then show those as Google-Maps-style roads (labels + strokes that match the guide). Traffic / Phone Maps later consume the same graph.

## To-dos (smallest parts)

### T1 — Template stays visible while building
- [ ] Keep terrain (green art) always under the draw/edit UI
- [ ] Optional dim/contrast helper so green lines read while tracing (no second fake road layer)

### T2 — Draw Highways mode (mirror Draw borders)
- [ ] HUD: **Draw highways** (admin/owner), separate from region borders
- [ ] Click verts along green art → polyline preview
- [ ] Snap: optional to existing highway verts + black-dot markers (not region verts by default)
- [ ] Name / ref / kind (`freeway` \| `highway`) on save
- [ ] `POST /api/map/highways` → merge route into `highways.json` (never wipe siblings; never touch pins/regions-ui)
- [ ] Load / edit existing route (same pattern as Load border)

### T3 — Render components from traced data only
- [ ] Paint GMaps-style strokes **only** for `canon: "gm-traced"` (or `art-traced` after GM accept)
- [ ] Shields + names at `label_at`
- [ ] Hide / archive `proposals[]` from paint (keep file for history)
- [ ] Toggle: **Hwy ON** = components; template always underneath

### T4 — Seed helpers (optional, after T2)
- [ ] One-click “import art-marker spine” as **draft** verts GM can drag onto green
- [ ] Re-run `extract-art-highways.py` only as draft seed — not product chrome until GM saves

### T5 — Traffic (later)
- [ ] Congestion on graph edges — see `docs/plans/isla-highways-traffic-2026-08-07.md`

## Recommended first ship

**T2 + T3** — Draw Highways like borders, save to `highways.json`, render those paths as the GMaps roads. Template (green) stays the guide in the background.

## Open for GM

1. Start with **Draw Highways** (T2) now?
2. Or seed drafts from black-dot extract (T4) first, then draw/refine?
3. Component look: classic GMaps yellow, or quieter grey/white so it doesn’t fight the green template while tracing?

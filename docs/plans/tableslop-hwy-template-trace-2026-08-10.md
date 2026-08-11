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

## Shipped 2026-08-10 (wireframe plane)

- Extract green+black from `master-enhanced.png` → skeleton → `map/highways-wireframe.png` (+ SVG, nodes in `highways.json`)
- Map stage = plane; overlay wireframe PNG expanded to 100% of stage; yellow dots = black markers; IP labels for named corridors
- Blender (PC): `map/highways-blender-plane.py` — textured map plane + wireframe overlay plane
- Re-run: `python scripts/tableslop/extract-art-highways.py`

## Superseded for product 3D (2026-08-10)

Flat wireframe-as-product is **not** the goal. Elevation track wins:

- Bake `heightmap-256` + `roadmask-256` from map art (`scripts/tableslop/bake-isla-heightmap.py`)
- `/3d` Minecraft-like columns + road tops (`terrain.js`); buildings sample local height
- Spec: `docs/tableslop-3d-aesthetic.md` § Minecraft-like elevation

Wireframe PNG may remain a debug/trace aid; HUD **3D** is the playable surface.

## Next (optional)

- **T2** Draw Highways to refine/name segments for GMaps chrome / traffic graph
- Finer height grid / player walk on heightfield (after terrain exists)

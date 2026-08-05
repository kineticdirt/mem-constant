# Region boundary TRACE-NOTES (Isla Primavera)

**Date:** 2026-08-01  
**Holder:** `tableslop-draw-borders`  
**Art SoT:** `vibes.png` (names/pins + red painted borders).  
**Product default:** **Areas/borders OFF** — city pins + terrain only. Auto polygons were wrong.

## Hierarchy (durable)

**Island regions → city → sub-regions.** Overworld R1–R14+ are parent regions; each city will nest sub-regions (Paradise pilot: `paradise-subzones.json`). Same pattern for every city later.

## GM owns boundaries now

- **Draw (v1):** HUD **Draw borders** → click vertices → **Close poly** (or double-click / Enter) → pick **parent region** (R#) → **Save border**. Assign target is parent region only — **not** city sub-regions yet.
- **Edit existing border (2026-08-01, `tableslop-edit-border-snap-ux`):** pick a region that already has points (dropdown **●**) → auto-load or click **Load border**. Drag cyan/yellow handles, click an edge to insert a vertex, **Alt+click** or **Del** (with vert selected) to remove (≥3 remain). **Save border** replaces that region's geom only — never wipes siblings.
- **Snap edges (2026-08-01, `tableslop-link-edges` + snap UX):** toolbar toggle **Snap edges** (default ON). Applies only while **placing new vertices** (not map-art decoration). Targets = **other regions'** existing vertices + mid-edge points (pink dots shown when Snap ON). Yellow ring + cursor `cell` = within snap radius (~1.6 map-%). Black squares on the terrain are roads/network art — **not** snap handles. **Link shared edge** (rewrite a whole segment from region A onto B) = **v2** — not shipped.
- **Next (stub):** draw target = region **or** city sub-region (dropdown from `*-subzones.json`); do not hardcode flat R1–R14 forever. Prefer nesting-ready schema over half-shipped subzone UI.
- **Persist:** `POST /api/map/regions-ui` → `regions-ui.json` on potato.
- **Pins:** keep/fix via **Edit** + **Save coords** (`map.json` / `coords.json`).
- **Pins bind by containment:** on map load / after region save, each city pin is matched to the area polygon that contains it (ray-cast point-in-polygon). Area labels prefer the pin name inside; mismatch (pin id ≠ area id) shows a warning. Draw **Save border** can suggest the region from which pin sits inside the new poly.
- **Do NOT** re-run Cursor Auto / `digitize-region-polygons.mjs` over GM work. Task `ts-map-boundaries-leftover` = **cancelled**.

## Old auto geometry

| File | Role |
|------|------|
| `regions-ui.json` (live v12+) | Stubs / GM-drawn polygons only; `enabled` flips true on first GM save |
| `regions-ui.draft.json` | Full backup of auto-digitized polygons + ellipse stubs (not product default) |

## Still empty live (draw when ready)

All regions until GM draws. Draft still has Paradise/Porto/Jackedsonville/San Aurelio/Sierra/Ruby/Lagooni/Puckall polygons + leftover ellipses for reference only.

## Canva terrain

`map/source/canva-terrain.png` is **still absent**. Does **not** block GM draw.

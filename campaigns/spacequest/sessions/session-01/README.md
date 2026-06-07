# Session 1 — Docking bay & asteroid mouth

**System:** D&D 5e (5 ft. squares). This folder is **session prep + assets**; the long-form **story beat** is in `story/`.

---

## Start here

| Doc | Use |
|-----|-----|
| [[../../story/session-01-docking-bay]] | Full session: situation, zones, Beat A/B, run plan, safety, canon links |
| [[session-start-beat-plan]] | **Table prep:** opening order, **5–6 rounds/turret**, **three areas**, fleshing checklist |
| [[maps/README]] | **Maps hub:** SVG links, regen commands, elevation, lore dots |

---

## Narrative & prep

| Resource | Purpose |
|----------|---------|
| [[../../story/session-01-docking-bay]] | Master writeup |
| [[session-start-beat-plan]] | Condensed start: dock → airlock → reception |

**Campaign lore (not session-only):** [[../../story/station-and-antagonist]] · [[../../story/station-systems]] · [[../../story/factions-and-enemies]]

**Mechanics:** [[../../story/systems-dnd5e-lewd-tech]] (cover §3.1.2, mines §3.5, Tension §1)

---

## Maps & VTT (`maps/`)

| Resource | Purpose |
|----------|---------|
| [[maps/README]] | Index, continuous layout, regen (`build_session01_svgs.py`) |
| [[maps/base-layout-anchors]] | GM one-pager: zones, anchors, tokens |
| [[maps/lore-placements]] | **#1–#12** pins ↔ read-alouds & hooks |
| [[maps/planarally]] | VTT setup, `*-pa.svg`, grid, vision |
| [[maps/docking-bay-z0-deck]] | Z0 ASCII + atmosphere (dock rows 1–19) |
| [[maps/docking-bay-z1-gantries]] | Z1 +10 ft gantries |
| [[maps/reception-lobby-z0]] | Lobby local grid (embedded in continuous SVG) |

**Player / print / VTT files**

| File | Role |
|------|------|
| [[maps/docking-bay-z0-deck-base.svg]] | Z0 continuous — player, unlabeled lore dots |
| [[maps/docking-bay-z0-deck-hidden.svg]] | Z0 — GM — numbered lore |
| [[maps/docking-bay-z0-deck-pa.svg]] | Z0 — Planar Ally map-only |
| [[maps/docking-bay-z1-gantries-base.svg]] | Z1 continuous — player |
| [[maps/docking-bay-z1-gantries-hidden.svg]] | Z1 — GM |
| [[maps/docking-bay-z1-gantries-pa.svg]] | Z1 — PA map-only |

---

## Tooling & automation (`maps/`)

| Resource | Purpose |
|----------|---------|
| `maps/build_session01_svgs.py` | Regenerate SVGs from grid constants |
| [[maps/session-01-map-spec.json]] | Spec input for codegen (`generate_from_spec.py`) |
| `maps/map_studio_server.py` + `map_studio.html` | Local browser map studio |
| `maps/tools/export_z0_grid_json.py` | Export floor JSON → `maps/floors/` |
| `maps/schemas/floor-spec.v1.schema.json` | Floor JSON schema |
| [[maps/CF-TUNNEL-CHECKLIST.md]] | Cloudflare / tunnel / PA hosting notes |

---

## Parent index

**All sessions:** [[../README]]

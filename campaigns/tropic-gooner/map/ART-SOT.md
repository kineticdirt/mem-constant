# Isla Primavera map — art Source of Truth

**Name / pin spelling SoT (canonical):**  
`Obsidian/DND Archive/World Of Darkness/vibes.png`  
(PC path under `MAIN_PROGRAMMING_FILES/Obsidian/…`; also mirrored under `Obsidian/PersonalVault/DND Archive/…`.)

| Role | File | Notes |
|------|------|-------|
| **Spellings + label positions** | **`vibes.png`** | Wins over Misc Notes / agent rebrands. HUD `markers[].label`/`name` must match. |
| Numbered region helper | `updated_highlight_number_map.png` (same WoD folder; potato `map/reference/`) | Grid numbers — not name SoT. |
| Pipeline raster source | `output-onlinetools4k.png` (WoD folder; potato `map/`) | Baked borders/labels; hybrid until Canva terrain export. |
| Runtime overworld | potato `map/master-enhanced.png` + `pyramid.json` tiles | What `:8765` draws; may still bake labels → prefer UI labels (`label_layer: ui`) and Labels toggle. |
| Canva terrain (optional) | `map/source/canva-terrain.png` | **Not present yet** — see `source/README-canva-terrain.md`. |
| Design wireframes | `projects/tableslop/design/` | HUD layout only — not place-name SoT. |

**Soft / not on vibes:** Orchid Falls, Nueva Vista — do not pin as vibes-canonical.  
**Vibes stubs (R15–R17):** Puckall, East Bayby, Research Islands — on art; lore deferred past beta; still pin to match art.  
**Product HUD title:** Isla Primavera (art title text is Paradisio Island).

`map.json` fields: `name_source`, `art_sot`. Deploy PC vibes-aligned JSON to potato; do not let think thrash restore lore display names.

**Region selectable areas:** `regions-ui.json` polygons track painted vibes/red (and Sierra gold) borders where digitized — see `TRACE-NOTES.md`. Ellipses remain stubs.

**Spatial hierarchy (GM 2026-08-01):** island **regions** (R1–R14+) → **city** (pin / settlement) → **sub-regions** (every city will have them). Paradise pilot list: `paradise-subzones.json`.

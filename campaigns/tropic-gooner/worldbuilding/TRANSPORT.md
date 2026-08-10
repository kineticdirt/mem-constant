# Isla Primavera — transportation

**Chronicle:** Tropic Gooner ∪ Hunter — `campaigns/tropic-gooner/`.  
**Present lock:** `wb-tg-date` → **2019**.  
**Status:** SoT draft for World editor, 2026-08-08.  
**Companions:** `STREETS.md` (street texture) · `REGIONS.md` · `CLIMATE.md` · `AGRICULTURE.md` · `map/layers.json` · SwitchBack lore under Things and Places of Note.

---

## Canon status

- **[canon]** — island has major coastal / highland highway language in older place lore; SwitchBack is the highway heart; San Aurelio has rail yards; ports move ships and boats; players drive, walk, and bus in product plans.
- **[map layer]** — `map/layers.json` → `highways` source `map/highways.json` (labeled overlay, default ON). Terrain image stays the Google-Maps-style baseline. **Do not wipe `regions-ui.json`.** Route paths are **[proposal]** until GM traces the green art exactly.
- **[GM map note]** — **green lines on the map = highways / freeways.** More roads still need drawing on the map. This file is prose + pointers, not a fake HUD that invents polys.
- **[proposal]** — mode table and play notes below.

---

## Modes

| Mode | Role | SoT / map |
|------|------|-----------|
| Highways / freeways | Island spine; green map lines | Draw later on map `highways` layer; prose here + SwitchBack |
| Local streets | City block texture | `STREETS.md`; map `streets` layer still empty source |
| Cars / scooters | Default PC movement | Player routines on map product |
| Buses | Cheap hops between bay cities | `transit-bus` layer placeholder |
| Rail | Bulk / south working belt | San Aurelio yards; `transit-rail` placeholder |
| Boats / ships | Marina, docks, ferry rumor | Paradise marina, Lujara docks, Ruby Harbor |
| Walking | District play | `STREETS.md` times |

---

## Highways (green lines)

Treat green road art as **highways / freeways**, not local alleys. The SwitchBack corridor is the diegetic "get anywhere" highway story. Bay ring routes link Paradise ↔ Porto Lujara ↔ Jackedsonville. Highland climbs reach Sierra Dorado. Coastal spurs serve Ruby Harbor and south working towns.

**What to edit where**

| Need | Where |
|------|--------|
| Lore, travel times, who controls rest stops | This file + `STREETS.md` / place notes |
| Visible green highway geometry | Map draw / `highways` layer assets — **later, on map** |
| Region borders | GM polygons in `regions-ui.json` only — never clear for roads |

---

## Play notes — [proposal]

- Off-peak bay drive Paradise ↔ Lujara is under an hour; Carnival and storm nights are not.
- Quay alleys are not freeway on-ramps. Do not let highway language erase street-level dens.
- Federal roads look better maintained. County roads look loved or ignored.

---

## Open questions

1. Name the bay ring road in-world, or keep it descriptive only?
2. Is passenger rail alive, freight-only, or dead tracks with hunters?
3. Which ferry is real vs brochure?

---

*Edit this file in World → Transport. Draw new green highway geometry on the map when ready.*

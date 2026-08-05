# NYC wire mesh map (GM utility)

Self-contained schematic map for placing campaign sites — not art, not GIS-accurate.

## Open locally

**File path (PC):**

`campaigns/nyc-mafia-dnd/map/nyc-wire-mesh.html`

Double-click or drag into a browser tab (`file://` works). Pins persist in **browser localStorage** for that origin only.

**Simple serve (optional):**

```bash
cd campaigns/nyc-mafia-dnd/map
python -m http.server 8769
```

Then open `http://127.0.0.1:8769/nyc-wire-mesh.html`

## Pins

| Action | How |
|--------|-----|
| Place | Click empty map → short label prompt |
| Edit label | Click pin |
| Move | Drag pin |
| Export | **Export JSON** or **Copy JSON** |
| Clear | **Clear all pins** (browser storage only) |

**localStorage key:** `nyc-mafia-dnd-wire-mesh-pins-v1`

## Suggested Gilded/Rail Labels

For Gilded-era and rail-syndicate campaigns, consider placing these critical infrastructure nodes:
- **Grand Central / Pemberton Yard:** Midtown Manhattan. The towering, brass-vaulted terminal of ward-rail with continual-flame schedule boards and secret family line-splices.
- **Jamaica / Harlan Junction:** Queens. The sprawling, high-chaos freight-sorting yard where clerks manually schedule boxcar movements (weak computation).
- **Vandermeer Tube / Hudson Sluices:** Hudson River bed. The high-pressure speaking-tube crossing and warded cargo shuttle connecting the Jersey docks to Manhattan.

**Export shape:**

```json
{
  "campaign": "nyc-mafia-dnd",
  "map": "nyc-wire-mesh",
  "exportedAt": "…",
  "pins": [{ "id": "pin-…", "x": 435, "y": 340, "label": "Blue Note" }]
}
```

`x` / `y` are SVG viewBox coordinates (0–1000 × 0–620), not lat/long.

## Hub Docs / potato

Hub Docs indexes **markdown** under `story/`, `characters/`, `worldbuilding/`, `reports/` — **HTML does not appear** in the Docs tree.

On linuxbox after sync, open directly:

`~/agent-dump/campaigns/nyc-mafia-dnd/map/nyc-wire-mesh.html`

Or SCP/serve from the campaign folder on potato-lan.

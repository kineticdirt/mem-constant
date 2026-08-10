# Isla Primavera — economy (full sim)

**Chronicle:** Tropic Gooner ∪ Hunter — `campaigns/tropic-gooner/`.  
**Present lock:** 2019.  
**Control plane:** `worldbuilding/economy-state.json`  
**Map overlay:** `map/economy-overlay.json` (resource sites — **not** city pins)  
**Engine:** `scripts/linuxbox/tableslop-economy-sim.js`  
**GM unlock:** full economic sim requested 2026-08-10 (overrides dual-app “out of scope” for this lane).

---

## What ticks

1. **Water bodies** — regen/extract by season + optional weather stress; feed seafood, freight, tourism, ice.
2. **Minerals** — slow regen, contested extract; feed stone / ore / power.
3. **Other** — cane, rum, honey, cold-chain, beds, casino cash, tech, grid.
4. **Commodities** — supply blends toward extract; demand from base + tourism/shipping modifiers; prices move on imbalance; rare market shock.

Soft clock: **1 tick ≈ 1 diegetic day** (`map/diegetic-clock.json` ~48h IRL).

## Commands

```bash
node scripts/linuxbox/tableslop-economy-sim.js --self-check
node scripts/linuxbox/tableslop-economy-sim.js --tick --days 1 --write
```

World editor → **Economy** → Tick day (auth). Map → **Econ** overlay toggle.

## Locks

- Do **not** move frozen city pins (`PIN-COORDS-LOCK.md`).
- Do **not** edit `regions-ui.json` from this lane.
- `[proposal]` mineral/federal rows stay marked until GM promotes.

## Open (play)

1. Which mineral sites are Kindred-fronted?
2. Does Base Fuerte Luna buy local food or fly it in?
3. Export tonnage vs brochure fiction?

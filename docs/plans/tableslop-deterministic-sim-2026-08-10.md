# Deterministic island sim (no LLM)

**Holder:** `tableslop-gmaps-highways-sim` · **Present lock:** 2019  
**Rule:** City pins FROZEN · `regions-ui` sacred · AI only for humanistic dialogue/RP — **not** for stocks, prices, travel, or daily needs.

## Layers

| Layer | Engine | SoT |
|-------|--------|-----|
| Terrain image | baseline (Google-Maps style) | `map/*.png` underlay |
| Highways + labels | SVG overlay | `map/highways.json` |
| Economy (water/minerals/other → prices) | `tableslop-economy-sim.js` | `worldbuilding/economy-state.json` |
| People (needs/wants/quirks) | `tableslop-agents-sim.js` | `worldbuilding/agents-state.json` |
| Weather | existing deterministic | `weather-state.json` |

## Person tick (each visible registry character)

1. Needs drift up (idiosyncratic quirks amplify some).
2. Dominant need picks a **deterministic** action (buy food, work, rent, social, nature…).
3. Actions spend/earn funds at **live commodity prices**.
4. Demand pressure nudges economy `base_demand`, then economy ticks one diegetic day.

## Commands

```bash
node scripts/linuxbox/tableslop-agents-sim.js --seed-from-registry --write
node scripts/linuxbox/tableslop-agents-sim.js --tick --days 1 --write
node scripts/linuxbox/tableslop-agents-sim.js --self-check
```

World → **Sim** (Economy + Agents panel). Map → **Roads** for labeled highways.

## Out of band (AI later)

Dialogue, sheet prose, Hunter mystery framing — not the daily price/need loop.

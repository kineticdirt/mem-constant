# Isla Primavera — market + gunplay sim design (2026-08-06)

**Status:** DESIGN + first slice implemented (`scripts/tableslop/isla-sim.js`, static panel).
**Holder:** `isla-sim-20260806`
**Audience:** GM (Wholesome Boi) + PC/laptop implementers + potato Hermes.
**Related:** `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md` (§4.6 sim tick, P6, D6 locked: potato = archive + slow sim, no live LLM citygen) · `docs/plans/isla-primavera-world-sim-vision-2026-08-06.md` (north-star silo catalog — this slice is the market + incidents silo with code; its `sim-broadcast.json` items are the typed events that vision's shared stream consumes) · `campaigns/tropic-gooner/map/diegetic-clock.json` (48h IRL ≈ 1 world day, soft) · `worldbuilding/LORE-BIBLE.md` / `GROUPS.md` / `STORIES.md` (faction + district SoT this sim reads).

---

## 1. What this is (and is not)

A small deterministic background simulation that makes the island feel alive between sessions: commodity prices drift, supply dries up under police attention, shootings spike heat, heat feeds back into prices and (later) patrol/encounter tables. It is the economic/violence layer of the roadmap's "archive + slowly simulating" product role.

**Is:** zero-dependency Node CLI, seeded PRNG, plain-JSON state, static HUD panel, radio-bridge file.
**Is not:** an LLM citygen, a live server, a player-facing mechanic with fiat power, or a replacement for GM narrative. Everything it emits is diegetic *texture* (blotter lines, radio items, price tables) the GM can override, ignore, or delete.

## 2. State schema (`sim-state.json`)

```json
{
  "version": 1,
  "world_day": 0,
  "seed": 20190812,
  "rng": 1442963193,
  "cities": {
    "r01": {
      "name": "Paradise",
      "heat": 12,
      "markets": {
        "rum":          { "price": 15.4, "supply": 0.55, "demand": 0.55 },
        "sugar":        { "price": 9.1,  "supply": 0.55, "demand": 0.45 },
        "vice":         { "price": 58.0, "supply": 0.60, "demand": 0.70 },
        "guns":         { "price": 142.0,"supply": 0.30, "demand": 0.35 },
        "touro_dollar": { "price": 100.0,"supply": 0.50, "demand": 0.65 }
      }
    }
  },
  "tensions": { "quay-rojo_vs_crimson-tithe": 0.7 },
  "incidents": [ { "id": "d0-i1", "world_day": 0, "city": "r03", "district": "the Row",
                   "factions": ["Quay Rojo", "Crimson Tithe"], "kind": "drive-by",
                   "casualties": 1, "heat_delta": 9, "blurb": "..." } ],
  "history": [ { "world_day": 0, "cities": { "r01": { "heat": 12, "prices": { "rum": 15.4 } } } } ],
  "gm_notes": []
}
```

- Cities keyed by region id (`r01`/`r02`/`r03`; the model is data-driven — adding a city is a config entry, not code).
- `incidents[]` capped at 200 (newest last, FIFO trim). `history[]` capped at 90 daily snapshots.
- `rng` is the carried mulberry32 state — successive CLI invocations continue one deterministic sequence; same seed + same tick count = byte-identical state.

## 3. Tick loop (one world day)

Per `--tick N` (default 1), for each day and each city, in order:

1. **GM overrides applied** (§5) — they run first and are never re-derived over.
2. **Heat decay** — `heat += (baseline - heat) * 0.06` (baselines r01 12 / r02 18 / r03 25 — Jackedsonville is "the least filtered of the three"), clamp [0,100].
3. **Heat pressure into markets** — above heat 50: guns supply suppressed (`supply -= (heat-50)/100 * 0.06`), vice demand squeezed (`demand -= …*0.04`), touro_dollar demand falls (`…*0.05`). High heat = raids, checkpoints, scared tourists.
4. **Supply/demand mean-revert** — `s += (s_base - s)*0.08 + noise*0.02`, clamp [0.05, 1.5]. City baselines come from lore: rum/sugar cheapest in Porto Lujara (production + docks), guns most available in Jackedsonville, vice demand highest in r01/r03, `touro_dollar` uniform.
5. **Price move** — `price *= 1 + 0.10*(demand-supply) + 0.04*(base/price - 1) + noise*vol` (vol: guns 0.05, vice 0.03, touro 0.02, staples 0.015), floor at 5% of base. Imbalance pushes, mean-reversion anchors, noise wobbles.
6. **Incident roll** — per city: `λ = base_rate * (0.5 + heat/60) * (0.4 + guns.supply)`, one Bernoulli draw (base rates r01 0.08 / r02 0.11 / r03 0.16). On fire: pick a tension pair active in that city weighted by pair tension, pick district + kind from the city profile, roll casualties (0-3: 40/30/20/10, +1 bucket shift when heat > 60), compute `heat_delta = 4 + casualties*4 + rng*3`, compose the blotter blurb from templates (no LLM). Tensions drift ±0.05/day, spike +0.15 when their pair fires, clamp [0.2, 1.0].
7. **Append** — incident(s) to `incidents[]` (cap 200), market snapshot to `history[]` (cap 90), `world_day++`.

Deterministic ordering: cities sorted, commodities sorted, one PRNG stream. No wall-clock input to the model (`generated_at` stamps are metadata only).

## 4. Event generation — factions and voice

Tension pairs live in a static `TENSIONS` config block at the top of `isla-sim.js`, each with a source comment quoting the GROUPS.md line it comes from (canon):

- `quay-rojo_vs_crimson-tithe` (r03) — tribute ledger dispute after the marina wrist incident.
- `crimson-tithe_vs_gilded-anchor` (r01 + r03) — shared blood sources, no shared trust; the border is a marina parking lot.
- `rough-ride_vs_quay-rojo` (r03) — licensed protection vs the other kind on the same blocks.

Jackedsonville-heavy on purpose: that is where the canon violence surface is. Porto and Paradise still roll incidents via the unaffiliated fallback ("local crews", "a dockside crew", "unknown parties") so the blotter isn't faction-war-only — most real police blotters aren't.

Districts come straight from the LORE-BIBLE district lists (marina/boardwalk/CRT block/PIU South/CiDance tower; Carnaval Route/docks/Ledger Row/Annex/Porto hills; Row/Quay/alleys/Main Street/Book Nook/stadium edge). Kinds: `drive-by`, `dockside ambush`, `robbery gone loud`, `standoff`, weighted per city. Blurbs are template-composed in a dry police-blotter register ("Shots fired from a moving vehicle… No fatalities reported. Investigation active."), matching the bible's voice rule: name the place, name the number, no brochure copy.

## 5. GM overrides — GM always wins

Three channels, in increasing permanence:

1. **Hand-edit `sim-state.json`.** It is plain JSON with field comments in this doc. The next tick continues from whatever the GM writes — pin a price, zero the heat, delete an incident. The sim never validates GM intent away.
2. **`sim-gm-overrides.json`** (optional, sits next to the state file). Applied at the start of every `--tick` run before any derivation:

```json
{
  "heat":    { "r01": 75 },
  "price":   { "r03.guns": 220 },
  "supply":  { "r02.guns": 0.15 },
  "tension": { "quay-rojo_vs_crimson-tithe": 1.0 },
  "inject_incidents": [ { "city": "r03", "district": "the Quay", "kind": "standoff",
                          "factions": ["Quay Rojo", "Crimson Tithe"], "casualties": 2,
                          "blurb": "GM-scripted beat for session 12." } ]
}
```

Injected incidents land in the log with `gm: true`, full heat effects, and are never re-rolled or culled beyond the same 200-cap. Set `"disable_random_incidents": true` to run a fully scripted stretch (session weeks).
3. **Delete the file.** `rm sim-state.json && isla-sim.js --init` restarts the world. No hidden state anywhere else.

## 6. Phasing toward the roadmap's off-line sim

Matches D6 (potato = archive + slow sim; laptop later for heavy; deterministic pregen only):

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **0 — this slice** | CLI tick + static HUD panel + `sim-static.json` export + `sim-broadcast.json` radio bridge. Runs anywhere Node runs; on potato a daily cron ticks 1 world-day (48h IRL clock ⇒ cron every 2 days, or daily at 2× pace — GM pick, see INTEGRATION-NOTE). | **done** |
| **1 — map mount** | One `serveStaticFile` stanza in `tableslop-server.js` following the `/3d` pattern (`/sim` → `tableslop-static/sim/`); optional `layers.json` entry `{ "id": "sim", "source": "sim/sim-static.json", "optional": true }` so the map can tint region chips by heat without a new API. | next, needs server edit window |
| **2 — consumers** | Radio bulletin engine optionally merges `sim-broadcast.json` items (shape in §7) into the island news rotation; encounter decks (`map/encounter-decks.json`) gain spawn-weight hooks keyed on district heat ("heat > 60 ⇒ CRT checkpoint cards in that city"); the `/3d` view can drop incident markers. | post-beta P4/P5 |
| **3 — coax/autonomous (P6)** | Autonomous agent priors read heat/markets ("Rojo lieutenants lie low while r03 heat > 70"); GM coax bus writes into `sim-gm-overrides.json` instead of free-form edits. Still deterministic core — LLMs consume and narrate, they never drive the tick. | P6 |

## 7. Radio bridge — `sim-broadcast.json`

Written by `--export` alongside `sim-static.json`. Top 2–3 items from the latest tick: highest-casualty incident(s), the biggest 7-day market mover, a heat alert when any city crosses 60. Phrased as radio news items so the radio lane's bulletin engine can merge them verbatim:

```json
{
  "source": "isla-sim", "world_day": 14, "generated_at": "…",
  "items": [
    { "id": "sim-d14-i41", "kind": "incident", "priority": 1, "city": "Jackedsonville",
      "headline": "Second shooting this week on the Row",
      "body": "County CRT confirms a drive-by in the Row early today. One casualty reported. Witnesses name Quay Rojo and Crimson Tithe figures. Investigation active." },
    { "id": "sim-d14-m1", "kind": "market", "priority": 2, "city": "Porto Lujara",
      "headline": "Rum up 18% on the week",
      "body": "Dockside suppliers blame manifest delays. Night Ledger forecasts higher bar tabs through the weekend." }
  ]
}
```

The radio lane reads this file **optionally**; this slice does not touch any radio file. `id`s are stable per world-day so a merger can dedupe.

## 8. Files, paths, runtime hygiene

| Path | Role |
|------|------|
| `scripts/tableslop/isla-sim.js` | The CLI. Zero deps, ESM, Node ≥ 18. |
| `scripts/linuxbox/tableslop-static/sim/index.html` + `sim.js` | Static HUD panel (market tables + 7-day sparklines, heat bars, blotter feed). Fetches `sim-static.json`, falls back to `sim-state.json`. No framework, no CDN. |
| `scripts/linuxbox/tableslop-static/sim/sim-state.json` | **Runtime state — must be gitignored** (candidate entry noted in INTEGRATION-NOTE; on potato the state should live under `agents/state/tableslop-sim/` per the runtime-vs-code contract, with `ISLA_SIM_STATE` pointing there). |
| `sim-static.json` / `sim-broadcast.json` | `--export` outputs beside the state file. Runtime, gitignored. |
| `scripts/linuxbox/tableslop-static/sim/INTEGRATION-NOTE.md` | Mount/cron/env wiring instructions for whoever gets the server window. |

**Env:** `ISLA_SIM_STATE` overrides the state path; `--state <path>` overrides both. Nothing else is configurable by env on purpose — the model constants live in one CONFIG block at the top of the file with lore citations.

**Cron shape (potato, phase 1):** `17 3 */2 * * * node ~/agent-dump/scripts/tableslop/isla-sim.js --tick 1 --export >> /mnt/archive/logs/isla-sim.log 2>&1` — one world-day per 48h, off-peak, append-only log on the archive HDD. This line is a suggestion for the integrator, not an installed change.

**Invariants (`--self-check` enforces):** prices > 0; heat ∈ [0,100]; incidents reference known cities and factions; caps respected (200/90); state round-trips through save/load; two same-seed runs of 10 ticks produce byte-identical state.

**Known ceilings (ponytail):** one Bernoulli incident per city per day caps violence at 3/day island-wide — fine at blotter scale, wrong for a war arc (GM scripts those via inject); markets are per-city islands with no cross-bay arbitrage; `touro_dollar` is an index, not a traded good. All three have obvious upgrade paths (Poisson draws, a trade-flow matrix, seasonal tourism curve) and none are needed for "feels more real" at beta scale.

# INTEGRATION-NOTE — Isla Primavera island sim

**What this dir is:** the static home of the market + gunplay background sim
(engine: `scripts/tableslop/isla-sim.js`; design: `docs/plans/isla-primavera-sim-design-2026-08-06.md`).
Shipped 2026-08-06 as **new standalone files only** — `tableslop-server.js` and the radio
lane were intentionally NOT touched (other lanes have them open). This note is the wiring
list for whoever takes the server/cron window.

## Files

| File | Kind | Notes |
|------|------|-------|
| `index.html`, `sim.js` | **tracked code** | The HUD panel. Fetches `sim-static.json`, falls back to `sim-state.json`. No server API needed. |
| `sim-state.json` | **runtime (gitignored)** | The world. Written by `--init`/`--tick`. |
| `sim-static.json` | **runtime (gitignored)** | `--export` snapshot the panel reads. |
| `sim-broadcast.json` | **runtime (gitignored)** | `--export` radio bridge — top 2-3 headlines of the tick. |
| `sim-gm-overrides.json` | **runtime (gitignored, optional)** | GM pins/injects; applied before every tick. |

## 1. Mount on the map server (phase 1)

Follow the existing `/3d` static pattern in `tableslop-server.js` (one stanza, no new deps):

```js
const SIM_DIR = path.join(__dirname, "tableslop-static", "sim");
// in the route table, next to the /3d handlers:
if (url === "/sim" || url === "/sim/" || url === "/sim/index.html") {
  serveStaticFile(res, path.join(SIM_DIR, "index.html"), 60);
} else if (url.startsWith("/sim/")) {
  const rel = decodeURIComponent(url.slice("/sim/".length));
  if (!rel.includes("..")) serveStaticFile(res, path.join(SIM_DIR, rel), 30);
}
```

Short cache on the JSON (30s) so the panel picks up cron exports quickly.
Panel then lives at `https://map.tableslop.org/sim`.

## 2. Cron the tick (potato)

Soft clock is 48h IRL ≈ 1 world-day (`campaigns/tropic-gooner/map/diegetic-clock.json`).

```cron
17 3 */2 * * * ISLA_SIM_STATE=/home/abhinav/agent-dump/agents/state/tableslop-sim/sim-state.json node /home/abhinav/agent-dump/scripts/tableslop/isla-sim.js --tick 1 --export >> /mnt/archive/logs/isla-sim.log 2>&1
```

- Keep potato state under `agents/state/tableslop-sim/` (runtime-state contract); copy the
  PC-seeded `sim-state.json` there once, or `--init` fresh on the box.
- If `--export` runs with state under `agents/state/`, exports land next to the state file —
  for the panel, either export into this dir via a second step
  (`--state agents/state/.../sim-state.json` for tick, then copy the two JSON exports here),
  or keep the whole sim in this dir. Both are supported; pick one and stay consistent.
- First run on the box: `node scripts/tableslop/isla-sim.js --self-check` (must pass), then `--init`.

## 3. Radio bridge (optional, do not edit radio files without their lane)

`sim-broadcast.json` shape (stable `id`s per world-day for dedupe):

```json
{ "source": "isla-sim", "generated_at": "…", "world_day": 14,
  "items": [ { "id": "sim-d14-i41", "kind": "incident|market|heat|quiet", "priority": 1,
               "city": "Jackedsonville", "headline": "…", "body": "…" } ] }
```

The radio bulletin engine may merge `items[]` verbatim into the island news rotation.
Full contract: design doc §7.

## 4. GM usage

- Hand-edit `sim-state.json` anytime — next tick continues from it.
- Drop a `sim-gm-overrides.json` next to the state file to pin heat/prices/supply/tension,
  inject scripted incidents (`gm: true`), or `"disable_random_incidents": true` for session weeks.
  Shape + examples: design doc §5.
- Reset the world: delete `sim-state.json`, run `--init`.

## 5. Verify after wiring

```bash
node scripts/tableslop/isla-sim.js --self-check        # invariants
node scripts/tableslop/isla-sim.js --status            # human summary
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/sim  # expect 200 after mount
```

# Tableslop → potato handoff (2026-08-01)

**Holder:** `pc-handoff-shutdown`  
**Why:** GM ordered remaining Tableslop/product work onto **linuxbox** parallel lanes, then **Windows PC shutdown**. PC is not the runtime host after this file.

## Done on Setup→Beta (S0–S3)

| Gate | Status | Notes |
|------|--------|--------|
| **S0** Setup | done | `tableslop-health-matrix.sh`, campaigns-avail smoke, Hub link-out docs, archive template policy, `map/diegetic-clock.json` (~48h IRL ≈ 1 world day) |
| **S1** Isla WB | done | Paradise + Porto expand, places notes, deep-dives; **`wb-tg-factions` closed** (ambient former-PC NPCs; no quest-obligation favors) |
| **S2** Deterministic pregen | done | Paradise subzones, fog GeoJSON, R1/R2 encounter decks, `layers.json` pointers |
| **S3** App A links | done | `player-character-links.json` + GET/POST `/api/campaigns/:id/links` + paste UI on `:8768` |

**Map HUD slice (partial):** vibes-aligned pins/labels on potato; polygons digitized for Paradise, Porto Lujara, Jackedsonville, San Aurelio, Sierra Dorado, Ruby Harbor, Lagooni Seika, Puckall (`regions-ui.json` v11). Error collector: `tableslop-error-collect.sh` → `reports/tableslop-errors/` (was ok=true).

## Art SoT (do not invent names)

- **Canonical art:** `vibes.png` — see `campaigns/tropic-gooner/map/ART-SOT.md`
- **Boundary leftovers:** `campaigns/tropic-gooner/map/TRACE-NOTES.md`
- Pin coords must stay inside polygons; thick red borders win over thin green roads
- Canva terrain (`map/source/canva-terrain.png`) still absent — does **not** block boundary work
- **Character flesh:** deferred. Factions locked ambient-only.

## What’s next (potato owns)

1. **Agent 2 — Cursor Auto SDK** — hand-trace remaining ellipses → polygons in `regions-ui.json`: Villa Miel, Seaside Springs, Black Sand Beach Preserve, Portview, InterFederal Shores, East Bayby, Research Islands (multi-poly OK). Playwright smoke after. Logs: `/mnt/archive/logs/cursor-agent/`.
2. **Agent 1 — Hermes think (OR+ZenMux)** — App A/B **dashboard UX** meat (not radio/autonomous); extend error/test collector if broken. Pick `[ ]` from `agents/tableslop-progress.md` / open user-tasks. Free-first; C8 paid rules. **Do not wait on Cursor.** Skip NYC park unless GM reopens. Not a second OR Hermes.

## Parallel invoke (potato)

Topology SoT: `docs/plans/hermes-parallel-lanes-2026-08-01.md` — **Agent 1** = Hermes think (OR+ZenMux); **Agent 2** = Cursor Auto SDK (**not** a second OR Hermes).

```bash
# Agent 2 — Cursor Auto only (explicit; not on think cron)
export CURSOR_SDK_AUTO_ONLY=1
nohup bash ~/agent-dump/scripts/linuxbox/cursor-agent-run.sh "$(cat <<'PROMPT'
Tableslop map leftover boundaries ONLY. Read campaigns/tropic-gooner/map/TRACE-NOTES.md and ART-SOT.md.
Digitize remaining ellipse regions in campaigns/tropic-gooner/map/regions-ui.json to match vibes.png red borders:
Villa Miel, Seaside Springs, Black Sand Beach Preserve, Portview, InterFederal Shores, East Bayby, Research Islands.
Pin must be inside polygon (coords/map.json). No character flesh. No registry wipe. Run Playwright tableslop smoke if present.
Update TRACE-NOTES.md when a region becomes polygon. Verify with curl :8765 /api/map.
PROMPT
)" >> /mnt/archive/logs/cursor-agent/tableslop-boundaries-handoff.log 2>&1 &
echo $!

# Agent 1 — already crontab: agent-cycle-think (1m) + agent-cycle-sync.sh; LLM ~8m
# Do NOT add a second think crontab / think-product flock.
crontab -l | grep agent-cycle
bash ~/agent-dump/scripts/linuxbox/cursor-lane-status.sh
```

## User-task ids

- `ts-map-boundaries-leftover` — **Agent 2** Cursor digitizing leftovers  
- `ts-dashboard-ux-test` — **Agent 1** Hermes App A/B UX + error framework  

Handoff + topology: `agents/tableslop-progress.md`, `docs/plans/hermes-parallel-lanes-2026-08-01.md`, roadmap `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md`.

## PC after this

Windows host shut down on GM order (`pc-shutdown-after-lanes`) only after Agent 1 crontab + Agent 2 Cursor verified. Potato keeps think + any nohup Cursor jobs. Do **not** cancel potato jobs when PC goes dark.

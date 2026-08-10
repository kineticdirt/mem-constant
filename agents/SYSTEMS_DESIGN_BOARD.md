# Systems design board (linuxbox)

**Goal:** one place to see **what each system is for**, how pieces atomize, and what to **reuse** instead of writing a custom path.  
**Surface:** this markdown is SoT; Hub **Meta** / **Docs** should link here (not embed a second SoT).  
**Update rule:** when you add a service or major script family, add one row — ponytail: one line of prose, not a new framework.

## How to read

| Column | Meaning |
|--------|---------|
| **System** | Named product/ops surface |
| **Goal** | Why it exists (one sentence) |
| **Runtime** | Where it runs / port / unit |
| **Atomize into** | Natural modules by function (reuse boundaries) |
| **Reuse first** | Existing helpers — grep these before inventing |

---

## Product surfaces

| System | Goal | Runtime | Atomize into | Reuse first |
|--------|------|---------|--------------|-------------|
| **map.tableslop (Theme B)** | Playable Isla Primavera map + world tools | potato `:8765` `linuxbox-tableslop` | map render · borders UI · cast read · auth · `/world` dash · smokes | `tableslop-server.js` sections; `tableslop-gm-borders-guard.sh`; `tableslop-smoke.mjs`; multitask lock for registry writes |
| **campaigns.tableslop (Theme A)** | Group hosting / availability / player↔char | potato `:8768` `linuxbox-campaigns-avail` | trackers · Discord probe meta · portal pages · links sidecar | `campaigns-availability-server.js`; `campaigns-avail-smoke.mjs` |
| **Hub `/Linuxbox/`** | Ops process hub (Inbox/Chat/Docs/…) | potato `:8790` (+ CF Access) | auth · inbox · chat threads · docs tree · Meta | `linuxbox-status-server.js`; `human-inbox-normalize.py`; protected-paths |
| **Pixi RP** | Continuity RP product | potato `:8767` `linuxbox-pixi-rp` | Send pipeline · WORLD_DELTA · sheets · hygiene | potato `~/pixi-rp/…` (not Hub) |
| **Portfolio** | Public abhinavall.net | `:3000` + origin `:8780` | static/site · Intel public · Hub admin path split | tunnel docs; do not route tableslop via abhinavall tunnel |

## Always-on agent

| System | Goal | Runtime | Atomize into | Reuse first |
|--------|------|---------|--------------|-------------|
| **Hermes think** | One lane step ~8m | `hermes-gateway` + crontab think | sync tick · lane pick · C0–C8 · free-first | `agent-cycle-think-tick.sh`; `agent-cycle-sync.sh`; `THINK_SECURITY_CHECKS.md` |
| **Ponytail cleanup** | Refine scripts without deletions | pod `ponytail-cleanup` ~15m | board card · verify · USB mirror | `PONYTAIL_CLEANUP_*`; `sync-ponytail-board-to-usb.sh` |
| **Daily deslop** | Once-per-day slop/DRY/regression pass | think when `daily-deslop-progress` open | seed · one refine · remember git burns | `DAILY_DESLOP_TASK.md`; `git-regression-memory.md` |
| **Island economy** | Water/minerals/other → commodity tick | World + map Econ overlay | resources · commodities · tick · overlay | `economy-state.json`; `tableslop-economy-sim.js` |
| **Cursor Auto (parallel)** | Away/ops coding on potato | `cursor-agent-run.sh` — not 1m cron | twin dispatch · user-tasks | `cursor-twin-dispatch.sh`; free→cursor→paid(C8) |

## Shared primitives (reuse catalog)

| Primitive | Goal | Path |
|-----------|------|------|
| Multitask lock | Prevent registry/inbox clobber | `scripts/linuxbox/multitask-lock.sh` |
| Protected runtime | Survive git reset/bundle | `agents/protected-runtime-paths.json` + `protected-paths.py` |
| Borders guard | Never ship stub `regions-ui` | `tableslop-gm-borders-guard.sh` |
| Inbox normalize | Keep `answered[]` | `human-inbox-normalize.py` |
| Supply-chain gate | Upgrade only if SAFE | `safe-update-check.sh` |
| Regression memory | Don’t re-break known modes | `agents/git-regression-memory.md` |
| Discord bot token | Canonical `DISCORD_BOT_TOKEN` resolve (env → hunter → tropic → hermes); never log | `scripts/linuxbox/discord_token.py` — shell: `tok=$(python3 scripts/linuxbox/discord_token.py)`; py: `from discord_token import _discord_token` |
| Deploy require-scan | Hub `require('./…')` modules must be on `DASHBOARD_PATHS` | `scripts/linuxbox/check-dashboard-require-paths.sh` (`--self-check`); push-linuxbox `--dashboard`/`--finished` |
| Dash-build pair | Keep Hub HTML meta ≡ server `DASH_BUILD` | `scripts/linuxbox/bump-dash-build.sh` (`--check` / `<id>`); verify-runtime-state fails on mismatch |

## Open design questions (board)

- [x] Hub Meta card: systems board + daily-deslop open count (2026-08-10)
- [x] Tableslop: pin vs border SoT → **A** (pins into borders; borders sacred) 2026-08-10
- [x] Document Discord token helper once extracted — `scripts/linuxbox/discord_token.py` in Shared primitives (dd-09 / 2026-08-09)

## Related docs

- Dual-app roadmap: `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md`
- Runtime protection: `docs/runtime-state-protection.md`
- Ponytail lane: `docs/agents/ponytail-cleanup-lane.md`
- Daily deslop: `docs/agents/daily-deslop.md`

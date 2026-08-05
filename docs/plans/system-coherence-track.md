# System coherence plan — track + execute

**Status:** ACTIVE tracking (2026-07-18)  
**Goal:** One coherent system — fewer forks, versions, and parallel implementations.  
**Ledger:** `AI_GROUPCHAT.md` Intent 2026-07-18T19:52Z (Gitea post-wizard migrate) / prior SoT Result 2026-07-18T18:30Z.  
**Topology:** [`rp-sot-topology-2026-07-18.md`](./rp-sot-topology-2026-07-18.md) · Gitea runbook [`gitea-rp-canonical.md`](./gitea-rp-canonical.md)

## Tracks

| ID | Track | Source | Execute now? |
|----|-------|--------|----------------|
| **A** | Sheet bloat: package-before-dossier + Python section-cap + revision regex-safe | Maya ~46KB → **6299** on disk; rev `20260718-sheet-cap-v1` | **Done** (2026-07-18) — post-merge cap + deploy verified |
| **B** | RP stack PC vs laptop vs linuxbox | `ObsidianWriterStack/branch-reconciliation-plan.md` | **SoT unified** @ `639dec6` (time-fix ported; bare+GitHub `main` FF) |
| **C** | Markdown / repo org | `docs/plans/repo-organization-plan.md` + inventory | **Phase 0 DONE** 2026-07-18 (`verify_repo_layout` PASS + inventory note); **STOP** — wait Phase 1 sign-off |

## North star

- **Single SoT tip** = `639dec6` on bare + GitHub `main` + live `pc/merge-onto-laptop` (was laptop `9d6051c` + PC ports + orphaned time-fix).  
- **Canonical RP host = linuxbox only** (Gitea `:13000` wizard done / admin `username`; migrate waits on `~/.gitea-migrate.env`; interim bare `~/repos/ObsidianWriterStack.git`). **Laptop remotes out of scope.**  
- **Deploy** = `~/pixi-rp/ObsidianWriterStack` git checkout of SoT tip.  
- **agent-dump** = ops/docs; movable md set is small — do not churn path-loaded skills.

## Phase gates (hard pause)

1. After A deploy → user can play; no further RP merge until B P0 done.  
2. After B P0 → stop; wait for P1 feature-diff sign-off.  
3. After C Phase 0 → stop; wait for Phase 1 doc moves sign-off. **(hit 2026-07-18)**

## Track C — Phase 0 result (2026-07-18)

- `scripts/verify_repo_layout.sh` → PASS; `scripts/inventory_md_baseline.py` → 1237 `.md` (movable set small).
- linuxbox gate: systemd active; `:8790` / `:8765/health` → 200.
- Phase 1 root plans already off-tree (potato archive); Phase 1 waitlist in `repo-organization-plan.md` inventory refresh — **do not execute until human OK**.

## Agents

- Grok A: sheet cap/order/revision — **complete** (`20260718-sheet-cap-v1`)  
- Grok B: P0–P5 + orphan time-fix → SoT `639dec6`  
- Grok C: Phase 0 baseline **complete** — awaiting Phase 1 sign-off  

## Track B status (2026-07-18) — SoT unified

- **Before:** live/bare merge `6fae9e6` / rev `20260718-merge-p5-v1`; bare `main`=`9d6051c`; orphaned time-fix only in bak dirty tree (`ObsidianWriterStack.bak.20260718T052841Z`).
- **After:** SoT SHA **`639dec6`** (`pc/merge-onto-laptop` = bare `main` = GitHub `main` = live checkout). Rev **`20260718-time-fix-v1`**. Bak: `ObsidianWriterStack.bak.pre-time-fix.20260718T182609Z`.
- **Merged / ported:** orphaned time-fix (zombie `system.md` beat-tier clock; `scene_presence` advance + daylight warnings; client `buildGameClockSystemBlock` tier align; generic multi-cast reminder). Prior P3–P5 features already on tip.
- **Pruned:** deleted dead `format_game_clock_markdown` (duplicate of live client game_clock inject); `KNOWN_UNWIRED` empty.
- **Orphans:**
  - `pc/orphan-time-fix` @ `639dec6` — **absorbed** (same tip as SoT; safe to delete later).
  - `pc/dead-code-tooling` @ `50c8bde` — **superseded** (content on SoT via earlier port commit).
  - `pc/wip-sheet-permanence` @ `dc47467` — **superseded** (sheet-cap/permanence/hygiene already on SoT; tip is divergent PC firefighting snapshot, not mergeable as-is).
- **P2 PARTIAL (2026-07-18T19:52Z):** Gitea wizard **done** (`INSTALL_LOCK=true`, Sign In OK, admin user literally `username`). Migrate **blocked**: no `GITEA_ADMIN_PASSWORD` / `~/.gitea-migrate.env` on potato — **will not invent**. Bare remains SoT @ `639dec6`; live `origin` still bare. Env example + migrate one-liner: `scripts/linuxbox/gitea-migrate.env.example`, `gitea-migrate-rp-from-bare.sh --owner username --user username`. Pixi `:8767` OK (`20260718-time-fix-v1`, sheet-cap live, 17 sessions).
- **Human next:** create `~/.gitea-migrate.env` (chmod 600) with password → run migrate → re-point live `origin` to Gitea; optionally delete `pc/orphan-time-fix` after ack.

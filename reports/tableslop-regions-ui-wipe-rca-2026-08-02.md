# RCA: `regions-ui.json` GM border wipe (2026-08-01)

**Investigator:** PC Cursor subagent (forensic slice, 2026-08-02)  
**Scope:** Potato `campaigns/tropic-gooner/map/regions-ui.json` — GM Draw→Save polygons  
**Restore state (post-RCA):** Live restored from `regions-ui.json.bak-autosave-2026-08-01T2208Z` (v19; Paradise 277 + Jacked 94 verts)

---

## Executive summary

GM borders were wiped when the on-disk file was replaced with the **committed git tree stub** (v2 ellipse overlays, 0 GM polygons). Runtime GM geometry was never committed on potato; only the working tree held the rich polygons. A git hard-reset/checkout class operation at **2026-08-01 20:50:09 EDT** reverted the file to HEAD. This is **not** `tableslop-server.js` restart behavior and **not** `push-tableslop-map.sh` default deploy (regions-ui excluded since 17:45 EDT).

---

## Timeline (EDT unless noted)

| Time | Event | Evidence |
|------|--------|----------|
| 2026-08-01 ~13:38 | Empty/stub shell after agent palette pass (v14 `enabled:false`, geom=0) | `AI_GROUPCHAT` 17:42Z borders-missing |
| 2026-08-01 17:06–18:08 | GM drawing session; reassignment Paradise→Jacked; autosave | Baks `bak-porto-protect`, `bak-paradise-porto-pip`; autosave mtime **18:08:52** |
| 2026-08-01 18:02 (22:02Z) | Ledger: live v19 — Paradise 277 + Jacked 94; Porto 0 | `AI_GROUPCHAT` empty-refuse-fix result |
| 2026-08-01 18:08:52 | `writeRegionsUiJson` autosave — **8948 B**, v19, **371 GM verts** | `regions-ui.json.bak-autosave-2026-08-01T2208Z` stat |
| 2026-08-01 17:45 | Protect manifest + `push-tableslop-map` exclude deployed to potato | `AI_GROUPCHAT` regions-ui-protect |
| 2026-08-01 **20:50:09** | **Wipe:** live file becomes v2 ellipse stub (**3747 B**, 0 polys) | `bak-before-restore-20260802T224508Z` Modify time; Birth on restore copy |
| 2026-08-02 ~18:45–18:47 | Restore from autosave; PC `map.json` redeploy (regions-ui untouched) | Live stat 8948 B; `AI_GROUPCHAT` gm-borders-restore |

**Gap:** No ledger line documents an intentional regions-ui write between 18:08 and 20:50. Think tick `think-tick-20260802-004802` (20:48 EDT) was dashboard-backlog only — no map/regions-ui commands in log tail.

---

## File / hash evidence

| Artifact | SHA-256 | Size | version | GM polys | Notes |
|----------|---------|------|---------|----------|-------|
| Wiped stub (`bak-before-restore-*`) | `f222390b04af3b81a0ac1e797748b962613a7ace7ba0c42351c9959c1f605d33` | 3747 | 2 | 0 (14 ellipses) | `_doc`: "Selectable ellipses — one unique overlay zone each…" |
| Potato `git show HEAD:…/regions-ui.json` | **`f222390b…` (identical)** | — | 2 | 0 ellipses | Commit `cdfe33d` tree |
| PC `git show HEAD:…/regions-ui.json` | `97725111c35101a1c48a873a7145084c07fd7e2ea8fc9dd9348f0dd25127f356` | 4658 | 4 | 1 poly + 14 ell | **Different** from wipe |
| Rich autosave | — | 8948 | 19 | 2 (277+94 verts) | Pre-wipe GM truth |
| Live (restored) | — | 8948 | 19 | 2 | Matches autosave |

**Conclusion:** Wiped bytes are **byte-identical to potato git HEAD**, not PC git HEAD and not the current rich runtime file.

---

## Mechanism (primary cause)

**Git reverted a tracked file to the committed stub, destroying unstaged runtime GM edits.**

1. `regions-ui.json` remains **git-tracked** on potato. `git log -- campaigns/.../regions-ui.json` shows only initial import (`5d34f0f`); all GM Draw saves were **working-tree only**.
2. Committed content is the old **`sync-overlay-coords.mjs` template** (version 2, ellipse stubs) — same `_doc` string as `scripts/tableslop/sync-overlay-coords.mjs` lines 168–172.
3. `git reset --hard` / checkout of the tracked path replaces the file with HEAD content — matches observed **Birth** semantics at wipe time.
4. `agents/state/git-sync.json` last bundle apply is **2026-07-15** (stale), but potato HEAD is **`cdfe33d`** (Aug NYC commits on-box). Local git history diverged from PC bundle sync; **on-box git tree still carries v2 stub for this path.**

### What did **not** cause the wipe (ruled out or unlikely)

| Hypothesis | Ruling |
|------------|--------|
| `tableslop-server.js` restart | No startup write of regions-ui; only `writeRegionsUiJson()` on Save/pin-drag |
| `POST /api/map/regions-ui` empty clear | Partial API refuses empty clear; wipe is **whole-file** v2 template |
| `push-tableslop-map.sh` default | Script excludes `regions-ui.json` unless `PUSH_REGIONS_UI=1` + non-stub local |
| `push-linuxbox.sh` tarball | `protected-paths.py filter-stdin` drops protected paths |
| PC git HEAD alone | PC HEAD is v4 (hash `97725111…`), not wipe hash |
| `sync-overlay-coords.mjs` at wipe instant | Produces same *shape* as git stub; wipe hash matches **git HEAD**, not a fresh overlay run artifact on disk |

---

## Preserve / restore analysis

| Component | regions-ui handling | Wipe-window gap |
|-----------|---------------------|-----------------|
| `agents/protected-runtime-paths.json` | `runtime-file`, `backup: true` (added 17:45) | Listed before wipe |
| `protected-paths.py` `preserve` | Copies **git-tracked** matches from **working tree** before reset | Should snapshot GM polys if preserve runs |
| `apply-git-bundle.sh` | preserve → `git reset --hard` → restore; legacy fallback **only** `characters-registry.json` if `preserve_ok=0` | If preserve failed silently, reset → v2 stub, **no regions-ui restore** |
| `git-pull-and-deploy.sh` | preserve/restore + stash/pop | Pull usually auth-fails on potato; stash pop failure leaves index version until `restore_protected` |
| `agent-cycle-sync.sh` | Runs bundle + pull every ~1m | No archived log line at 20:50 naming bundle apply (logs sparse) |

**Preserve/restore is designed correctly when `preserve_ok=1` and restore completes.** The wipe pattern (exact HEAD bytes) implies either:

- A **git hard reset/checkout** ran without a successful restore for this path, or  
- A process copied **committed** stub onto the path (equivalent outcome).

No code change applied in this RCA slice — gates from holder `gm-borders-restore-urgent` already landed (`writeRegionsUiJson`, verify-runtime-state, push-tableslop refuse, sync-overlay refuse).

---

## Contributing factors

1. **GM geometry never committed** — git always ready to snap back to v2 stub on reset.
2. **Committed stub is agent-generated ellipse template** (`sync-overlay-coords.mjs`), not GM Draw output.
3. **Potato vs PC git divergence** — potato HEAD stub (v2) ≠ PC HEAD (v4); bundle sync metadata stale.
4. **Earlier same-day empty SCP** (17:42 pins-colors included v14 empty regions-ui) established pattern of agents touching the file via SCP, not only HUD Save.
5. **Multitask NYC SCP burst** (~20:50–00:50Z) — heavy `scp potato-lan` activity; increases risk of incidental git/stash operations on box during agent cycles.

---

## Recommendations

1. **Operational (ask GM):** On potato, `git update-index --skip-worktree campaigns/tropic-gooner/map/regions-ui.json` (or stop tracking the path) so `reset --hard` cannot revert GM file — GM approval before changing git tracking.
2. **apply-git-bundle (ask GM):** If `preserve_ok=0`, **fail loud** or extend legacy fallback beyond `characters-registry.json` to all `protected-runtime-paths.json` `runtime-file` entries (minimal code fix).
3. **Sync discipline:** PC agents must `scp potato-lan:…/regions-ui.json` after GM saves; never push PC copy toward potato without `regions-ui-gm-stats.py` check.
4. **Monitoring:** Keep `TS-MAP-GM-BORDERS-MISSING` + autosave baks; restore path proven (`bak-autosave-2026-08-01T2208Z`).
5. **Do not rip** existing `writeRegionsUiJson` / push-tableslop gates from agent `40f0a51b` — they address recurrence vectors after the wipe.

### Implemented 2026-08-02 (gm-borders-guard slice)

| Mechanism | Path |
|-----------|------|
| Vert-count watermark | `campaigns/tropic-gooner/map/regions-ui.gm-watermark.json` (v19, Paradise 277 + Crimson Quay 94) |
| Guard script | `scripts/linuxbox/tableslop-gm-borders-guard.sh` — PASS/FAIL vs watermark; `--accept` only to bump |
| verify-runtime-state | Calls guard after bak-empty check (check 5b) |
| Agent checklist | `agents/TABLESLOP_PROJECT_TASK.md`, this file |

**Usage:** after any map/deploy touch → `tableslop-gm-borders-guard.sh` then `verify-runtime-state.sh --context tableslop-map`. After GM saves new geometry → `tableslop-gm-borders-guard.sh --accept`.

---

## Remaining regression gaps (post-guard)

| Vector | Status | Notes |
|--------|--------|-------|
| `git reset --hard` on potato | **Partial** | `protected-paths.py preserve` restores runtime-file when `preserve_ok=1`; if preserve fails, legacy fallback is **chars-registry only** — regions-ui can still snap to git HEAD stub |
| Git-tracked stub in `main` | **Open (ask GM)** | `regions-ui.json` still tracked (v2/v4 ellipse template in HEAD). `skip-worktree` or untrack+gitignore would block reset clobber — needs GM approval before `git rm --cached` |
| `apply-git-bundle` preserve failure | **Open (ask GM)** | WARN + registry-only fallback; recommend fail-loud or full runtime-file fallback |
| `push-tableslop-map.sh` | **Gated** | Excludes regions-ui by default; `PUSH_REGIONS_UI=1` refuses empty/stub/downgrade |
| `push-linuxbox.sh` tarball | **Gated** | `protected-paths.py filter-stdin` drops regions-ui |
| `sync-overlay-coords.mjs` | **Gated** | REFUSE when GM polys present |
| `digitize-region-polygons.mjs --apply` | **Gated** | REFUSE when GM polys present |
| `writeRegionsUiJson` (HUD) | **Gated** | Refuses vert drop / wipe |
| PC `scp` direct to map path | **Policy** | No script gate — agents must follow REGIONS-UI-LOCK; watermark catches after-the-fact |
| Cursor Auto / manual git on box | **Policy** | No hard block on `git checkout -- regions-ui.json`; watermark + verify fail loud post-hoc |
| Partial vert regression | **Gated** | Watermark guard (new) catches per-poly drops, not only empty-file wipe |

---

## Commands / paths used

```bash
# Potato
stat ~/agent-dump/campaigns/tropic-gooner/map/regions-ui.json*
sha256sum …/regions-ui.json.bak-before-restore-20260802T224508Z
git -C ~/agent-dump show HEAD:campaigns/tropic-gooner/map/regions-ui.json | sha256sum
python3 -c "…" # stub stats: v2, 0 polys, 14 ellipses

# PC
git show HEAD:campaigns/tropic-gooner/map/regions-ui.json | sha256sum
python3 scripts/linuxbox/regions-ui-gm-stats.py campaigns/tropic-gooner/map/regions-ui.json
```

**Related docs:** `campaigns/tropic-gooner/map/REGIONS-UI-LOCK.md`, `docs/runtime-state-protection.md`

---

## Appendix: second wipe ~2026-08-02 19:27 EDT (forensic 2026-08-02 23:40Z)

**Guard (post-restore):** `bash scripts/linuxbox/tableslop-gm-borders-guard.sh` → **PASS** `v=19 verts=371 (r01-paradise:277,r03-crimson-quay:94)`.

### Culprit (evidence-backed)

| | |
|--|--|
| **Actor** | **Cron `agent-cycle-sync.sh`** at **19:27:02 EDT** (`auth.log` `CRON[2476164]`) **plus** concurrent **PC desktop `192.168.4.57`** SSH burst (same second). |
| **Mechanism** | **`git reset --hard` class** on tracked `regions-ui.json` → potato **git HEAD** v2 ellipse template (**not** a fresh `sync-overlay-coords.mjs` run — `coords.json` unchanged since **18:48**). |
| **Bytes** | Wiped stub = `sha256 f222390b04af3b81a0ac1e797748b962613a7ace7ba0c42351c9959c1f605d33` (= `git show HEAD:…/regions-ui.json` on potato). PC `git HEAD` is **different** hash (`97725111…`). |
| **Timeline** | **19:27:03** `sudo systemctl restart linuxbox-tableslop` (`journalctl`, matches `push-tableslop-map.sh` remote tail). **19:27:06** `git-pull-and-deploy` preserve dir `/tmp/linuxbox-protected-preserve-2476230` snapshot **8948 B v19** GM file. **19:27:07** live `regions-ui.json` **Birth** (new inode) → stub **3747 B** until manual restore (~19:29) from `bak-autosave-2026-08-01T2208Z`. |
| **Not** | Cursor Auto `tableslop-black-map` (prompt file **19:30**, log `cursor-20260802T233000Z-2478343.log` — no commands yet). `sync-overlay-coords.mjs` at wipe instant (no REFUSE on potato, but no coords churn). |

**Primary class:** same as 2026-08-01 wipe — **tracked git stub overwrote unstaged GM runtime truth** during automated sync/deploy window, with **preserve snapshot proving GM v19 existed on disk 1s before stub landed** (restore/stash/pop race or reset-after-preserve).

### Gate / deploy gaps to fix

1. **`scripts/linuxbox/push-tableslop-map.sh` on potato** — still **old** (always includes `regions-ui.json`; no `skip` / `PUSH_REGIONS_UI` gate). PC copy is gated; **SCP updated script to potato** on next deploy.
2. **`scripts/tableslop/sync-overlay-coords.mjs` on potato** — **no REFUSE** when GM polys exist (PC has gate ~line 189).
3. **`apply-git-bundle.sh`** — `protected-paths.py` restore loads manifest from **live REPO after reset** (snapshotted `_tool/manifest.json` unused); recommend restore via snapshotted manifest + **fail loud** if `preserve_ok=1` but `regions-ui` verts drop (watermark/guard already catch post-hoc).
4. **`git-pull-and-deploy.sh`** — preserve at **19:27:06** had v19; stub at **19:27:07** implies **stash pop or concurrent deploy** after preserve; audit stash scope for tracked `regions-ui.json` (exclude from stash or always `restore_protected` after pop).

**Ledger:** `[PC] Result` appended 2026-08-02T23:40Z — holder `regions-ui-wipe-rca-19:27`.

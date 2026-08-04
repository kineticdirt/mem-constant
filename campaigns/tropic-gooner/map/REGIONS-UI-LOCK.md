# DO NOT SCP / wipe GM borders in `regions-ui.json`

Holder: `tableslop-regions-ui-protect` + hard rule `gm-borders-never-clear` (2026-08-01)

## Hard rule (GM)

**NEVER** clear borders the GM set out again.

- **NEVER** wipe GM Draw → **Save border** geometry on potato (or PC after pull).
- **NEVER** empty `areas[].points` / replace live polys with stubs, palette-only shells, or `enabled:false` geom=0 files without an **explicit GM ask**.
- **NEVER** SCP / rsync / `push-tableslop-map` an empty or stub `regions-ui.json` over potato.
- Protect already in place — agents must not empty `regions-ui.json` “to reset,” “clean,” or “migrate palette.”
- **NEVER** run `sync-overlay-coords.mjs` or `digitize-region-polygons.mjs --apply` against live potato when GM polygons exist — both scripts now **REFUSE** (coords/map-only for sync-overlay).

## Root cause (2026-08-01 wipe — evidence)

| Evidence | Detail |
|----------|--------|
| Wiped file | `version: 2`, `_doc: "Selectable ellipses — one unique overlay zone each"` — **ellipse stubs, 0 GM polys** |
| Birth mtime | Potato `2026-08-01 20:50 EDT` (new file created at wipe) |
| Pre-wipe autosave | `regions-ui.json.bak-autosave-2026-08-01T2208Z` — v19, **Paradise 277 + Jacked 94** (371 verts) |
| Generator match | `scripts/tableslop/sync-overlay-coords.mjs` writes **identical v2 ellipse template** (was unconditional) |
| Git tracked stub | `main` also has ellipse stubs (v4) — `apply-git-bundle` preserve only helps **tracked** files; runtime GM edits must stay untracked or restore after reset |
| Not the HUD | `POST /api/map/regions-ui` already refuses empty clear; wipe was **whole-file replace** |

**Mechanism:** overlay sync (or SCP of its output) replaced potato live file with ellipse stubs. `push-tableslop-map.sh` excluded `regions-ui.json` by default since 2026-08-01 17:45 — the 20:50 wipe was **not** that script unless `PUSH_REGIONS_UI=1` + empty PC copy.

## Restore-only policy

- Rich autosave / `bak-*` with GM verts → **restore-only** (copy bak → live, safety `bak-before-restore-*` first).
- Do **not** restore `regions-ui.draft.json` auto-polys without GM OK.
- Sync direction: **potato → PC** after restore.

## Ownership / sync

- **Potato owns** live borders after HUD **Draw → Save border** (`POST /api/map/regions-ui` → `campaigns/tropic-gooner/map/regions-ui.json`). Save border **persists**; do not undo that write.
- Same class as `characters-registry.json`: listed in `agents/protected-runtime-paths.json` (`runtime-file`). `push-linuxbox.sh` tarballs drop it via `protected-paths.py filter-stdin`.
- **`push-tableslop-map.sh` excludes `regions-ui.json` by default.** Opt-in `PUSH_REGIONS_UI=1` only after potato→PC pull with **non-empty** GM polys; script **REFUSES** if local verts &lt; remote or local is empty/stub while remote has polys.
- `tableslop-server.js` `writeRegionsUiJson()` refuses writes that drop GM vert count or wipe all polys (pin-drag + Save border).
- `verify-runtime-state.sh` + `tableslop-error-collect.sh` (**TS-MAP-GM-BORDERS-MISSING**, **TS-MAP-CITY-BORDER-MISSING**) fail loud if live empty while bak has polys, or a started city (Paradise/Porto/Jacked) lost its verts.
- **Always-on corrector:** `agent-cycle-sync.sh` runs `tableslop-error-collect.sh` every minute → `reports/tableslop-errors/LATEST.json`; Hub `/api/agent` exposes `tableslop_errors`; Maps silo shows error count.
- **Porto Lujara empty (2026-08-01+):** not a wipe — PIP reassigned the 277-pt poly to Paradise (Porto pin outside). Live Porto verts=0 until GM **Draw→Save** a new Porto border, or explicitly reassigns Paradise→Porto (empties Paradise). Autorestore will **not** invent a second poly.
- **Watermark guard:** `regions-ui.gm-watermark.json` + `scripts/linuxbox/tableslop-gm-borders-guard.sh` — compares live vert counts; **exit 1 on regression**; update baseline **only** with `--accept` (never auto-bump on PASS).
- Shared stats: `scripts/linuxbox/regions-ui-gm-stats.py`


## skip-worktree / untrack — git cannot revert GM file

On **linuxbox (potato)**, the live GM file must survive `git reset --hard` / bundle apply when preserve misses:

```bash
cd ~/agent-dump
git update-index --skip-worktree campaigns/tropic-gooner/map/regions-ui.json
git ls-files -v campaigns/tropic-gooner/map/regions-ui.json   # expect leading S (skip-worktree)
```

- **skip-worktree** keeps the file on disk and tells git not to checkout HEAD over it during reset (preferred on potato).
- Repo **`.gitignore`** lists `campaigns/*/map/regions-ui.json` for hygiene on new clones; already-tracked copies need skip-worktree (or `git rm --cached` + commit to untrack without deleting disk).
- **Do not** commit ellipse stubs to `main` as the “source of truth” — potato HUD owns geometry; `protected-paths.py` GM-rich restore + `tableslop-gm-borders-autorestore.sh` after bundle/pull are backup layers only.
- PC may keep a pulled copy or local stub; use skip-worktree locally if you edit GM borders on PC without intending to push stubs.

## Agent checklist (after map touch / deploy)

```bash
bash scripts/linuxbox/tableslop-gm-borders-guard.sh
bash scripts/linuxbox/verify-runtime-state.sh --context tableslop-map
```

If GM added/changed borders and counts **increased**, run `--accept` once to refresh the watermark.
- Pins stay in `map.json` / `coords.json` — see `PIN-COORDS-LOCK.md`.

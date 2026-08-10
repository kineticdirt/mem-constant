# Daily deslop — procedure

Ops companion to Cursor **deslop** + workspace **ponytail**. Goal: keep the linuxbox/agent-dump tree lean and reusable without deleting product files.

## Daily desk (agent)

1. Open `agents/daily-deslop-progress.md`.
2. If today’s section is empty of open work, seed **one** `[ ]` from:
   - `agents/papercuts.md` (open `pc-*`)
   - `agents/PONYTAIL_CLEANUP_BOARD.md` Backlog (first card — or leave for ponytail pod)
   - `agents/git-regression-memory.md` rows marked **prevention thin**
   - Duplicate logic under `scripts/linuxbox/` (same helper copied ≥2 times)
3. Before editing: skim regression memory for the files you touch.
4. Prefer extract-to-shared over copy-paste. Name helpers by **function** (`multitask-lock`, `chars-registry-persist`), not by ticket id.
5. One verify + ledger line.

## Atomization rule

Split only when **two different goals** share a tangle (e.g. map render vs auth gate). Do not split for aesthetics. Each unit should answer: *what goal does this serve?* (see `agents/SYSTEMS_DESIGN_BOARD.md`).

## Human

- Add regression rows when a wipe/revert/`git reset` burns you again.
- Ponytail pod still runs its own 15m board; daily deslop is the **once-per-day** intentional pass so think does not starve cleanup forever.

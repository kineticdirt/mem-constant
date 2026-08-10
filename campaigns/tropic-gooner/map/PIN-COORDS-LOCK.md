# DO NOT overwrite pin coords without GM OK

**LOCKED / FROZEN** — holder `tableslop-pins-lock-freeze` (2026-08-10)

## Rule

- **Stop moving pins.** Current `coords.json` + `map.json` percents are frozen SoT.
- Freeze file: `pin-coords-frozen.json` (potato + repo).
- Guard: `bash scripts/linuxbox/tableslop-pin-coords-guard.sh` (FAIL if any region moves).
- Re-freeze **only** after explicit GM ask: `bash scripts/linuxbox/tableslop-pin-coords-guard.sh --accept`
- **API merges `coords.json` over `map.json`** — never edit one without the other (and never without GM + --accept).
- Agents / digitize / centroid / “policy A” scripts: **do not** rewrite `x_pct`/`y_pct`.
- `regions-ui.json` is separate and still sacred (`REGIONS-UI-LOCK.md` / borders guard).
- Human Edit-drag on the map: only if GM asks; then Save + `--accept` to re-freeze.

## Client

Hard-refresh; clear site data once for `map.tableslop.org` if old `coord_overrides` linger.

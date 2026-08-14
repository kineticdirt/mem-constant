# GameSys map — mem-constant goal pointer

**Product:** **GameSys** (Isla Primavera) on `https://map.tableslop.org/` — Discord RP plane + map SoT.  
**North star:** `docs/plans/gamesys-isla-primavera-2026-08-14.md`

## Map ops (still true)

- **Potato owns** `regions-ui.json` (GM Draw → Save). Never invent verts; never wipe GM polys.
- **Started cities** (Paradise, Porto Lujara, Jackedsonville) must keep borders once drawn.
- **Error corrector** = `tableslop-error-collect.sh` → `reports/tableslop-errors/LATEST.json`.
- Roads/lanes = **GameSys game system**, not paint-only (G1+).

## Pointers

| What | Path |
|------|------|
| GameSys north star | `docs/plans/gamesys-isla-primavera-2026-08-14.md` |
| Lock | `campaigns/tropic-gooner/map/REGIONS-UI-LOCK.md` |
| Guard | `scripts/linuxbox/tableslop-gm-borders-guard.sh` |
| Progress | `agents/tableslop-progress.md` |
| Ops discipline | `.mem-constant/ops-discipline.md` |

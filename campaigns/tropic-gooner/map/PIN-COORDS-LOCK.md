# DO NOT overwrite pin coords without GM OK

Holder: `tableslop-pins-colors` (2026-08-01)

- Pin positions live in `map.json` + `coords.json` (vibes.png label SoT).
- Cursor Auto / digitize / ellipse jobs must **not** rewrite `x_pct`/`y_pct` or restore Orchid Falls / Nueva Vista.
- Region polygon digitize may touch `regions-ui.json` geometry only — leave pin coords alone.
- Edit-mode Save → `POST /api/map/coords` is the intentional human path.

- Live borders: see `REGIONS-UI-LOCK.md` (potato owns `regions-ui.json`; never SCP empty PC stubs).

# DO NOT overwrite pin coords without GM OK

Holder: `tableslop-pins-colors` (2026-08-01) · **policy A** locked 2026-08-10 (`tableslop-pins-into-borders-A`)

- Pin positions live in `map.json` + `coords.json`. **API merges `coords.json` over `map.json`** — update **both** or the old vibes coords win.
- **2026-08-10 GM call: A wins** — borders (`regions-ui.json`) stay sacred; pins move **into** existing GM polys. Not B (re-draw borders). Not C (Aug 7 baks are regions-ui-only and would risk good borders).
- Applied: Paradise / Porto / Jackedsonville / San Aurelio (Culovera) / Ruby Harbor → border centroids; bak `map.json.bak-before-pins-A-*` + `coords.json.bak-before-pins-A-*` on potato. Log: `pin-into-borders-A-applied.json`.
- Cursor Auto / digitize / ellipse jobs must **not** rewrite `x_pct`/`y_pct` or restore Orchid Falls / Nueva Vista without GM OK.
- Region polygon digitize may touch `regions-ui.json` geometry only — leave pin coords alone unless GM asks A again.
- Edit-mode Save → `POST /api/map/coords` is the intentional human fine-tune path (drag after clear site data).

- Live borders: see `REGIONS-UI-LOCK.md` (potato owns `regions-ui.json`; never SCP empty PC stubs).
- Client: hard-refresh; if pins look like an old drag session, **clear site data once** for `map.tableslop.org` (stale `coord_overrides`).

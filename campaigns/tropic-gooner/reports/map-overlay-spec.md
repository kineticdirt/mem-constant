# Map overlay spec — Tropic Gooner (Hunter: The Reckoning)

**Goal:** Map image with GPS-style pins from `map/map.json` on tableslop + dashboard.

## Data

- `map/map.json` — markers with `x_pct`, `y_pct` (0–100), `label`, `kind`, optional notes.
- Base image: `map/output-onlinetools4k.png` (human must add).

## Endpoints

| Surface | URL |
|---------|-----|
| **tableslop** (public via CF) | `http://127.0.0.1:8765/` · `/api/map` · `/map-image` |
| **Dashboard** (admin) | `GET /api/campaigns/tropic-gooner/map` · `/map-image` on `:8790` |

Install: `sudo bash scripts/linuxbox/install-tableslop-linuxbox.sh` · `docs/tableslop-linuxbox.md`

## UI follow-up

- Dashboard **Stories/Camp** tab: embed same viewer or iframe tableslop loopback.
- Marker types: `city`, `town`, `org`, `scene`, `preserve`.

## Agent work

- After human adds base image, place `x_pct`/`y_pct` per region (one per tick).
- Discord ingest may add `scene` markers for recurring RP locations.

**Status:** tableslop server shipped; dashboard tab + CF hostname pending human.

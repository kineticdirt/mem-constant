# tableslop.org on linuxbox

Lightweight **campaign map viewer** for **Tropic Gooner** (same chronicle as Hunter: The Reckoning).
Runs on linuxbox so the endpoint stays up when the Windows PC is off.

**Two Themes under Tableslop** (Setup→Beta — see dual-app roadmap):

| Theme | Role | Live |
|-------|------|------|
| **A — Campaign ops** | Group hosting / availability / player trackers | `campaigns.tableslop.org` → potato **`:8768`** |
| **B — World map** | Isla Primavera / Hunter / WoD play surface | `map.tableslop.org` → potato **`:8765`** |

**Hub link-out (plain English):** `/Linuxbox/` is ops only — it **links out** to those two hostnames. Hub must **not** embed or re-implement the map as if Hub were the product SoT.

**Plans:** [`docs/plans/tableslop-dual-app-roadmap-2026-08-01.md`](plans/tableslop-dual-app-roadmap-2026-08-01.md) (§9 S0–S3) · [`docs/plans/isla-primavera-wb-finish-checklist-2026-08-01.md`](plans/isla-primavera-wb-finish-checklist-2026-08-01.md) · soft clock stub `campaigns/tropic-gooner/map/diegetic-clock.json` (`hours_per_world_day: 48`) · archive templates policy `campaigns/tropic-gooner/ARCHIVE-TEMPLATE-POLICY.md`.

| Piece | Location |
|-------|----------|
| Server | `scripts/linuxbox/tableslop-server.js` |
| systemd | `linuxbox-tableslop.service` |
| Install | `sudo bash scripts/linuxbox/install-tableslop-linuxbox.sh` |
| Loopback | `http://127.0.0.1:8765/` |
| Health matrix | `bash scripts/linuxbox/tableslop-health-matrix.sh` (potato loopback; optional `TABLESLOP_CHECK_PUBLIC=1`) |
| Error collect | `bash scripts/linuxbox/tableslop-error-collect.sh` → `reports/tableslop-errors/LATEST.json` (codes in `codes.json`; optional `TABLESLOP_RUN_SMOKES=1`) |
| Art SoT | `campaigns/tropic-gooner/map/ART-SOT.md` — **names/pins = `vibes.png`** |
| Data | `campaigns/tropic-gooner/map/map.json` + base image |
| Region borders | HUD **Draw borders**: new verts **or** **Load border** / auto-load saved poly → drag handles, click edge to add, Alt+click/Del to remove → **Save border** (replaces that region only). Regions with a saved poly show **●** in the dropdown. **Snap edges** (default ON): while placing **new** verts only, stick to **other regions'** corner/mid-edge dots (pink when Snap ON; yellow ring = snapped; threshold ~1.6% map). Black squares on terrain art are **not** snap handles. **Link shared edge** rewrite = v2. **Pins bind by containment** (ray-cast PIP → `region_id` / `pin_ids`; label prefers pin name; mismatch warn; Save can suggest region from pin inside poly). Live `regions-ui.json` is **potato-owned** (protected runtime; never SCP empty PC stubs — see `map/REGIONS-UI-LOCK.md`); draft `regions-ui.draft.json`. **Areas default ON** (`showAreas !== false`; toggle chip when `overlay_layer=ui`). Hierarchy: island regions → city → **sub-regions** (Paradise pilot `paradise-subzones.json`). **v1 draw = parent region;** nested next. |
| Cast | Same SoT as dashboard Chars: `campaigns/tropic-gooner/characters-registry.json` via `GET /api/characters` + portraits at `/api/characters/image` (read-only). HUD **Cast** / `#cast`. Edits/merge/upload stay on `/Linuxbox` Chars. Logged-in **user**: **My char** when Discord-linked; no world-edit chrome. |
| Auth / roles | Discord OAuth — [`docs/tableslop-discord-auth.md`](tableslop-discord-auth.md) · env `~/.linuxbox-tableslop/.env` · configure `scripts/linuxbox/configure-tableslop-discord-auth.sh` |
| Lived-in | Rentals + district demographics — [`docs/tableslop-lived-in.md`](tableslop-lived-in.md) · `/lived-in/` · journal box on city select · generator `scripts/tableslop/gen-rentals-listings.mjs` |
| Agent runbook | [`docs/agents/tableslop-map-agent.md`](agents/tableslop-map-agent.md) — locks, roles, safe edit checklist |
| Public / GitHub pack | [`docs/public/tableslop/`](public/tableslop/README.md) — sanitized docs for sharing (no secrets/infra) |
| Availability / player trackers | `scripts/linuxbox/campaigns-availability-server.js` · `linuxbox-campaigns-avail` · `:8768` · **canonical** `https://campaigns.tableslop.org/` (tunnel `WOD_HTR_LinBox_TABLESLOP` → `http://127.0.0.1:8768`) · optional interim map proxy `https://map.tableslop.org/camp/` |

## Cloudflare Tunnel

**Policy:** split connectors — see **`docs/cloudflare-tunnels-linuxbox.md`**.

1. On linuxbox: `curl -sf http://127.0.0.1:8765/health` → `{"ok":true,...}`.
2. **Zero Trust** → **WOD_HTR_LinBox_TABLESLOP** (tableslop only — not `abhinavall.net` tunnel).
3. **Public Hostname:** `map.tableslop.org` → **`http://127.0.0.1:8765`**
4. **Public Hostname (live):** `campaigns.tableslop.org` → **`http://127.0.0.1:8768`** + DNS CNAME `campaigns` → same tableslop tunnel. Optional interim: `/camp/*` on map.
5. **systemd:** `sudo bash scripts/linuxbox/install-cloudflared-tableslop-tunnel.sh '<TOKEN>'`
6. Do **not** add map routes to `~/.cloudflared/config.yml` or run deprecated `install-cloudflared-tunnel.sh`.

**Planar Ally** (`:8000`) and **Foundry** (`:30000`) are separate heavy apps; this viewer is the ponytail map overlay until PA is deployed on the box.

## Verify

```bash
bash scripts/linuxbox/tableslop-health-matrix.sh
curl -s http://127.0.0.1:8765/health
curl -s http://127.0.0.1:8765/api/map | head -c 200
curl -s http://127.0.0.1:8765/api/characters | head -c 300
curl -s http://127.0.0.1:8768/health
```

## Cast (characters on the map)

- **Primary cast UI:** `https://map.tableslop.org/#cast` (HUD Cast button).
- **SoT:** `campaigns/tropic-gooner/characters-registry.json` (protected runtime — never wipe on deploy).
- **Dashboard Chars (`:8790`):** admin edit surface (upload, merge, stubs) + thin link “Open on map →”.
- **Not yet on tableslop:** create/merge/upload, Discord attachment resolve, full sheet markdown render, region↔character_ids pins (`cl-03` still open in `projects/tableslop/manifest.json`).

Playwright (from `.staging/portfolio-redesign/_screenshots`):

```bash
PREVIEW_URL=https://map.tableslop.org/ node ../../../../campaigns/tropic-gooner/map/tableslop-smoke.mjs
PREVIEW_URL=https://campaigns.tableslop.org/ node ../../../../campaigns/tropic-gooner/map/campaigns-avail-smoke.mjs
```

Map smoke: loads, 14 pins inside image bounds, region sidebar selects pin.  
Campaigns smoke: home + `/health` must be up (fails loudly if Theme A down).

Public URLs: `https://map.tableslop.org/` · `https://campaigns.tableslop.org/`

## Player ↔ character links (S3 — no OAuth)

Manual paste on App A trackers. Does **not** write `characters-registry.json` (sidecar only).

| Piece | Detail |
|-------|--------|
| UI | `https://campaigns.tableslop.org/c/<campaign>` → **Player ↔ character links** (two paste fields + Save) |
| Sidecar | `campaigns/<id>/player-character-links.json` |
| GET | `/api/campaigns/<id>/links` |
| POST | `/api/campaigns/<id>/links` body `{ "discord_user_id": "<17–20 digit snowflake>", "character_id": "<registry slug>", "note": "optional" }` · header `X-Tracker-Key` (or loopback when key unset) |
| Validation | Discord snowflake digits; character slug; if `characters-registry.json` exists, `character_id` must match a row |

**How to use:** open the campaign tracker → paste Discord user id (Developer Mode → Copy User ID) + character registry id (Hub Chars / map cast) → optional note → tracker key → **Save link**. Re-paste the same `character_id` to update its Discord id. Tropic example: `/c/tropic-gooner`.

# tableslop.org on linuxbox

Lightweight **campaign map viewer** for **Tropic Gooner** (same chronicle as Hunter: The Reckoning).
Runs on linuxbox so the endpoint stays up when the Windows PC is off.

| Piece | Location |
|-------|----------|
| Server | `scripts/linuxbox/tableslop-server.js` |
| systemd | `linuxbox-tableslop.service` |
| Install | `sudo bash scripts/linuxbox/install-tableslop-linuxbox.sh` |
| Loopback | `http://127.0.0.1:8765/` |
| Data | `campaigns/tropic-gooner/map/map.json` + base image |
| Cast | Same SoT as dashboard Chars: `campaigns/tropic-gooner/characters-registry.json` via `GET /api/characters` + portraits at `/api/characters/image` (read-only). HUD **Cast** / `#cast`. Edits/merge/upload stay on `/Linuxbox` Chars. |
| Availability | `scripts/linuxbox/campaigns-availability-server.js` · `linuxbox-campaigns-avail` · `:8768` · public `https://campaigns.tableslop.org/` (up/down list; not the map) |

## Cloudflare Tunnel

**Policy:** split connectors — see **`docs/cloudflare-tunnels-linuxbox.md`**.

1. On linuxbox: `curl -sf http://127.0.0.1:8765/health` → `{"ok":true,...}`.
2. **Zero Trust** → **WOD_HTR_LinBox_TABLESLOP** (tableslop only — not `abhinavall.net` tunnel).
3. **Public Hostname:** `map.tableslop.org` → **`http://127.0.0.1:8765`**
4. **systemd:** `sudo bash scripts/linuxbox/install-cloudflared-tableslop-tunnel.sh '<TOKEN>'`
5. Do **not** add map routes to `~/.cloudflared/config.yml` or run deprecated `install-cloudflared-tunnel.sh`.

**Planar Ally** (`:8000`) and **Foundry** (`:30000`) are separate heavy apps; this viewer is the ponytail map overlay until PA is deployed on the box.

## Verify

```bash
curl -s http://127.0.0.1:8765/health
curl -s http://127.0.0.1:8765/api/map | head -c 200
curl -s http://127.0.0.1:8765/api/characters | head -c 300
```

## Cast (characters on the map)

- **Primary cast UI:** `https://map.tableslop.org/#cast` (HUD Cast button).
- **SoT:** `campaigns/tropic-gooner/characters-registry.json` (protected runtime — never wipe on deploy).
- **Dashboard Chars (`:8790`):** admin edit surface (upload, merge, stubs) + thin link “Open on map →”.
- **Not yet on tableslop:** create/merge/upload, Discord attachment resolve, full sheet markdown render, region↔character_ids pins (`cl-03` still open in `projects/tableslop/manifest.json`).

Playwright (from `.staging/portfolio-redesign/_screenshots`):

```bash
PREVIEW_URL=https://map.tableslop.org/ node ../../../../campaigns/tropic-gooner/map/tableslop-smoke.mjs
```

Checks: map loads, 14 pins inside image bounds, region sidebar selects pin.

Public URL after DNS: `https://<your-hostname>.tableslop.org/`

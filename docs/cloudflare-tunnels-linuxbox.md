# Cloudflare tunnels on linuxbox (split policy)

**One physical host, two logical surfaces, two connectors.** No shared `cloudflared.service` — that pattern caused connector thrashing.

## Surfaces

| Surface | Role | CF tunnel name | systemd unit | Origin |
|---------|------|----------------|--------------|--------|
| **tableslop** | RP / map + campaign availability | `WOD_HTR_LinBox_TABLESLOP` | `cloudflared-tableslop` | `map.tableslop.org` → `:8765`; `campaigns.tableslop.org` → `:8768` |
| **abhinavall + linuxbox** | Site, Hub, Intel (`abhinavall.net`) | `abhinavall.net` | `cloudflared-abhinavall` | `abhinavall-origin-8780` → `:3000` / `:8790` |

**Minimal overlap:** tableslop tunnel carries **only** `*.tableslop.org` hostnames (`map` + `campaigns`). Backend tunnel carries **only** `abhinavall.net` (paths `/`, `/Linuxbox/`, `/Intel/` via `tunnel-origin-proxy.js` on `:8780`).

**Retired (do not re-enable):**

- `cloudflared.service` — generic token slot; `install-cloudflared-tunnel.sh` ran global `service uninstall`
- `cloudflared-tunnel.service` — legacy `config.yml` / `abhinav-portfolio-tunnel`; remove `map.tableslop.org` from `config.yml` if present

## Install (linuxbox)

Tokens live in `~/.cloudflare/*.env` (chmod 600, never commit).

```bash
cd ~/agent-dump

# 1) Backend (abhinavall.net tunnel token)
sudo bash scripts/linuxbox/install-cloudflared-abhinavall-tunnel.sh '<ABHINAVALL_TUNNEL_TOKEN>'

# 2) RP frontend (WOD_HTR_LinBox_TABLESLOP token)
sudo bash scripts/linuxbox/install-cloudflared-tableslop-tunnel.sh '<TABLESLOP_TUNNEL_TOKEN>'
```

**One-time cutover** from legacy shared connector (auto-reads abhinavall token from old `cloudflared.service` if present):

```bash
sudo bash scripts/linuxbox/migrate-cloudflared-split-tunnels.sh '<abhinavall_token>' '<tableslop_token>'
# or abhinavall-only auto-migrate:
sudo bash scripts/linuxbox/migrate-cloudflared-split-tunnels.sh
```

## Cloudflare Zero Trust (human, per tunnel)

### `WOD_HTR_LinBox_TABLESLOP`

| Field | Value |
|-------|-------|
| Public hostname | `map.tableslop.org` |
| Service | `http://127.0.0.1:8765` |
| Public hostname | `campaigns.tableslop.org` |
| Service | `http://127.0.0.1:8768` (`linuxbox-campaigns-avail`) |

DNS (zone `tableslop.org`): CNAME `campaigns` → `<tunnel-uuid>.cfargotunnel.com` (proxied). Helper: `bash scripts/linuxbox/add-campaigns-tableslop-ingress.sh`.

### `abhinavall.net`

| Field | Value |
|-------|-------|
| Public hostname | `abhinavall.net` (and `www` if used) |
| Service | `http://127.0.0.1:8780` |

Use **`127.0.0.1`**, not `localhost` (IPv6 `[::1]` pitfall on ARM box).

## Verify

```bash
systemctl is-active cloudflared-abhinavall cloudflared-tableslop linuxbox-tableslop abhinavall-origin-8780
curl -sI https://abhinavall.net/
curl -sI https://abhinavall.net/Linuxbox/
curl -s https://map.tableslop.org/health
curl -sI https://campaigns.tableslop.org/players
bash scripts/linuxbox/add-campaigns-tableslop-ingress.sh
bash scripts/linuxbox/add-tableslop-cloudflared-ingress.sh
```

## Agents / maintenance

- **Never** run deprecated `install-cloudflared-tunnel.sh`
- Abhinavall reinstall → `install-cloudflared-abhinavall-tunnel.sh` only
- Tableslop reinstall → `install-cloudflared-tableslop-tunnel.sh` only
- `LINUXBOX_DASHBOARD_TASK.md`: do not change CF routes without human sign-off

## Related

- `docs/cloudflare-tunnel-abhinavall.md` — origin proxy / 8780 detail
- `docs/tableslop-linuxbox.md` — map app systemd
- `scripts/linuxbox/*-tunnel.env.example` — env file templates

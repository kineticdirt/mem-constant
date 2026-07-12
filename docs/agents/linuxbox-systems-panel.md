# Linuxbox Systems panel + alerts

**Hub tab:** `/Linuxbox/` → **Systems** (admin only)

## What you get

- **Health cards** for each tunnel, app, and agent service — custom **SVG icon** per endpoint
- **Plain-language about** on every card (what it does); click **Details** / card header for unit state, ports/URLs, recent journal, and scheduler “doing now” when cheap
- **Host resources panel:** CPU %, RAM used/total + avail, swap, load; storage tiers (SD / PERSONAL USB / archive HDD); top processes by CPU and RSS
- **Control buttons:** start / stop / restart (whitelisted units only; admin auth required)
- **Alerts:** `linuxbox-alert-check.sh` every 5m → email (Resend) or [ntfy.sh](https://ntfy.sh) push

## Cloudflare tunnel icons

The **Hub Systems panel** uses repo SVGs under `scripts/linuxbox/linuxbox-status/icons/`.  
The **Cloudflare Zero Trust dashboard** does not support per-tunnel custom icons via `cloudflared` config — use CF’s UI labels only there.

## Setup alerts (one-time on linuxbox)

```bash
cp ~/agent-dump/scripts/linuxbox/alerts.env.example ~/.linuxbox-dashboard/alerts.env
chmod 600 ~/.linuxbox-dashboard/alerts.env
# Edit: RESEND_API_KEY + ALERT_EMAIL_TO and/or ALERT_NTFY_URL

sudo cp ~/agent-dump/scripts/linuxbox/linuxbox-alert-check.timer /etc/systemd/system/
sudo cp ~/agent-dump/scripts/linuxbox/linuxbox-alert-check.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now linuxbox-alert-check.timer
```

## Sudo for control buttons

Restarting system units (`cloudflared-*`, `linuxbox-status`) uses `sudo -n`. Add a sudoers drop-in on linuxbox if needed:

```text
abhinav ALL=(ALL) NOPASSWD: /bin/systemctl restart cloudflared-abhinavall.service, /bin/systemctl restart cloudflared-tableslop.service, /bin/systemctl restart linuxbox-status.service, /bin/systemctl restart linuxbox-tableslop.service, /bin/systemctl restart abhinav-portfolio.service, /bin/systemctl restart agent-pod-scheduler.timer
```

User-scoped Hermes gateways use `systemctl --user` (no sudo).

## Registry

Edit `agents/linuxbox-systems.json` to add endpoints; match `icon` to a file in `linuxbox-status/icons/`.  
Plain-language blurbs live in `SERVICE_META` inside `scripts/linuxbox/linuxbox-systems.js` (keyed by system `id`).

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/systems` | admin — host metrics + service cards |
| GET | `/api/systems/{id}/detail` | admin — unit show + journal (+ scheduler now for pod-scheduler) |
| GET | `/icons/{name}.svg` | admin |
| POST | `/api/systems/control` | admin — body `{ "system_id", "action" }` |

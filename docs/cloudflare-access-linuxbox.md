# Cloudflare Access — `abhinavall.net/Linuxbox/`

Two layers protect the dashboard:

1. **Cloudflare Access (edge)** — Google SSO and/or email one-time code before traffic reaches linuxbox.
2. **App-level roles (Bitwarden-friendly)** — HTTP Basic auth on the dashboard itself:
   - **admin** / `DASHBOARD_TOKEN` → full control (Hub, Inbox, Chat, Tasks, Meta, campaigns)
   - **viewer** / `DASHBOARD_VIEWER_TOKEN` → News, stocks/intel, public docs only

> **SSO overview:** `docs/cloudflare-sso-linuxbox.md`

## What exists on linuxbox

| Piece | Role |
|-------|------|
| `linuxbox-status.service` | Dashboard on **127.0.0.1:8790** |
| `tunnel-origin-proxy.js` | **`/Linuxbox*`** → **8790** |
| `~/.linuxbox-dashboard/.env` | `DASHBOARD_TOKEN`, `DASHBOARD_VIEWER_TOKEN`, usernames (chmod **600**) |

Public URL: **https://abhinavall.net/Linuxbox/**

## Login flow (recommended)

1. Browser → Cloudflare Access → **Sign in with Google** (or email OTP fallback).
2. Browser prompts for **HTTP Basic** auth (Bitwarden can autofill):
   - **Admin:** username `admin`, password = `DASHBOARD_TOKEN`
   - **Viewer:** username `viewer`, password = `DASHBOARD_VIEWER_TOKEN`

### Bitwarden setup

Create two entries for the same URL `https://abhinavall.net/Linuxbox/`:

| Name | Username | Password |
|------|----------|----------|
| Linuxbox admin | `admin` | value of `DASHBOARD_TOKEN` on the box |
| Linuxbox viewer | `viewer` | value of `DASHBOARD_VIEWER_TOKEN` on the box |

Use **Basic auth** / website password fields; Bitwarden will offer them after Cloudflare Access.

### Credentials on linuxbox

Template: `scripts/linuxbox/linuxbox-dashboard.env.example`

```bash
nano ~/.linuxbox-dashboard/.env   # chmod 600
# DASHBOARD_TOKEN=...
# DASHBOARD_ADMIN_USER=admin
# DASHBOARD_VIEWER_TOKEN=...
# DASHBOARD_VIEWER_USER=viewer
sudo systemctl restart linuxbox-status
```

Generate tokens: `openssl rand -hex 24`

## Enable Google SSO (one-time dashboard + script)

**Step A — Dashboard (you, ~2 min):**

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Settings** → **Authentication**
2. **Login methods** → **Add** → **Google** → save (uses Cloudflare’s shared Google app by default)

**Step B — API script (on linuxbox):**

```bash
cd ~/agent-dump
export GOOGLE_EMAIL=you@gmail.com    # the Google account you sign in with
bash scripts/linuxbox/cloudflare-access-enable-google.sh
```

This attaches Google to the `abhinavall-linuxbox` app and adds your Gmail to the allow policy (keeps `abhinav.allam@abhinavall.net` too).

## Viewer vs admin (app roles)

| Tab / API | Admin | Viewer |
|-----------|-------|--------|
| News, stocks, intel feeds | ✓ | ✓ |
| Public docs (situation + code-discovery reports) | ✓ | ✓ |
| Hub, agent lanes, health | ✓ | — |
| Inbox, Chat, Tasks, Meta, campaigns | ✓ | — |
| POST (chat, tasks, inbox reply) | ✓ | — |

Viewer API paths: `/api/intel`, `/api/news`, `/api/reports/public`, `/api/reports/situation-monitor`, `/api/reports/code-discovery`.

## Access application (already created)

- **Name:** `abhinavall-linuxbox`
- **Path:** `/Linuxbox` only (portfolio `/` stays public)
- **Policies:** Allow owner emails → Block everyone

## Verify

1. Incognito → `https://abhinavall.net/Linuxbox/`
2. Cloudflare → Google (or OTP)
3. Basic auth → admin or viewer credentials
4. Viewer: only **News** and **Docs** tabs; no Chat/Inbox/Hub
5. `https://abhinavall.net/` → portfolio, no Access prompt

## Service commands

```bash
sudo systemctl restart linuxbox-status
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8790/
```

## Related

- `scripts/linuxbox/linuxbox-status-server.js`
- `scripts/linuxbox/linuxbox-dashboard.env.example`
- `scripts/linuxbox/cloudflare-access-enable-google.sh`

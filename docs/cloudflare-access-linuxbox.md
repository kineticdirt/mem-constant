# Cloudflare Access — `abhinavall.net/Linuxbox/`

## Public POC (share with anyone — no login)

**https://abhinavall.net/Intel/** — open on the internet, no Cloudflare Access, no password.

Shows the **viewer** dashboard only: News, stocks/intel feeds, public situation/code-discovery docs. No Hub, Chat, Inbox, or agent controls. Safe to text to friends or open on their phones.

Admin control stays at **https://abhinavall.net/Linuxbox/** (Access + Basic auth).

Two layers protect the dashboard:



1. **Cloudflare Access (edge)** — Google SSO and/or email one-time code before traffic reaches linuxbox.

2. **App-level roles (Bitwarden-friendly)** — HTTP Basic auth on the dashboard itself:

   - **admin** (and any extra `role:admin` accounts, e.g. **HeadUser**) → full control (Hub, Inbox, Chat, Tasks, Meta, campaigns)

   - **viewer** / **guest** (any `role:viewer` account) → News, stocks/intel, public docs only

   Primary pair: `DASHBOARD_ADMIN_USER`/`DASHBOARD_TOKEN` + `DASHBOARD_VIEWER_USER`/`DASHBOARD_VIEWER_TOKEN`. Extra named users: `DASHBOARD_EXTRA_ACCOUNTS` JSON in the same `.env`. **Real passwords: potato `~/.linuxbox-dashboard/.env` only** (never commit).



> **SSO overview:** `docs/cloudflare-sso-linuxbox.md`



## What exists on linuxbox



| Piece | Role |

|-------|------|

| `linuxbox-status.service` | Dashboard on **127.0.0.1:8790** |

| `tunnel-origin-proxy.js` | **`/Intel*`** → **8790** `/viewer` (public); **`/Linuxbox*`** → **8790** (admin) |

| `~/.linuxbox-dashboard/.env` | tokens + usernames + optional `DASHBOARD_EXTRA_ACCOUNTS` (chmod **600**) |



Public URL: **https://abhinavall.net/Linuxbox/**



## Login flow (recommended)



1. Browser → Cloudflare Access → **Sign in with Google** (or email OTP fallback).

2. Browser prompts for **HTTP Basic** auth (Bitwarden can autofill):

   - **Admin:** username `admin` (or `HeadUser`) — password from box `.env`

   - **Viewer:** username `viewer` or `guest` — password from box `.env`



### Bitwarden setup



Create one entry per account for `https://abhinavall.net/Linuxbox/` (usernames typically `admin`, `HeadUser`, `guest`, `viewer`). Passwords = values on potato `~/.linuxbox-dashboard/.env` — do not copy them into this doc.



Use **Basic auth** / website password fields; Bitwarden will offer them after Cloudflare Access.



### Credentials on linuxbox



Template: `scripts/linuxbox/linuxbox-dashboard.env.example`



```bash

nano ~/.linuxbox-dashboard/.env   # chmod 600

# DASHBOARD_TOKEN=...

# DASHBOARD_ADMIN_USER=admin

# DASHBOARD_VIEWER_TOKEN=...

# DASHBOARD_VIEWER_USER=viewer

# optional extras — see linuxbox-dashboard.env.example (HeadUser/guest etc.)

# DASHBOARD_EXTRA_ACCOUNTS=[...]

sudo systemctl restart linuxbox-status

```



Generate tokens: `openssl rand -hex 24` (real values only on box `.env`; never commit).



## Temporarily bypass Cloudflare SSO (toggle — keep code)

When Google/OTP login is broken or you need HTTP Basic only:

```bash
# On linuxbox (uses ~/.cloudflare/access-setup.env API token)
bash ~/agent-dump/scripts/linuxbox/cloudflare-access-toggle.sh off

# Restore SSO later
bash ~/agent-dump/scripts/linuxbox/cloudflare-access-toggle.sh on
```

Or set in `~/.cloudflare/access-setup.env`:

```bash
CLOUDFLARE_ACCESS_SSO_ENABLED=off   # on|off — default on
```

**How it works:** `off` adds a temporary **bypass** policy (`agent-temp-sso-bypass`, precedence 0) via API; `on` removes it. IdP + allow policies from `cloudflare-access-enable-google.sh` stay intact. App-level HTTP Basic (`DASHBOARD_TOKEN`) is unchanged unless you also set `DASHBOARD_OPEN=read|all` in `~/.linuxbox-dashboard/.env`.



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



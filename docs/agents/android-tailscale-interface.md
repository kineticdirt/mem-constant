# Android on the same network — interface to linuxbox

**Feedback doc (2026-06-02).** You will install Tailscale on Android; this is how to reach **linuxbox** (`100.122.108.94`) for portfolio preview, SSH, and (optionally) Hermes messaging — **without** needing the exit node while at home.

## Same Wi‑Fi vs Tailscale IP

| Situation | What to use |
|-----------|-------------|
| Phone + PC + Pi on **same LAN** | Either **`100.122.108.94`** (Tailscale) or Pi LAN IP **`192.168.4.23`** (if unchanged) |
| Phone on **other Wi‑Fi / cellular** | **`100.122.108.94`** only (join tailnet; optional **Use exit node** for home egress — separate from accessing Pi services) |

**Important:** Portfolio preview and SSH are **tailnet services**. You do **not** need **Use exit node** to open `http://100.122.108.94:8765/` — only turn on exit node when you want **all internet** traffic to exit via home.

## 1. Portfolio preview (easiest — no SSH)

1. Install **Tailscale** from Play Store; sign in to your tailnet.
2. Ensure linuxbox shows **Connected** in admin console.
3. On the phone browser open:

   **http://100.122.108.94:8765/**

4. If it fails:
   - Pi preview not running → on linuxbox: `bash ~/agent-dump/scripts/website/portfolio_serve_preview.sh` (or PC starts via SSH).
   - Tailscale ACL blocks port **8765** → allow TCP to `100.122.108.94:8765` in [ACL](https://login.tailscale.com/admin/acls) or test on same LAN with `http://192.168.4.23:8765/` if the server binds `0.0.0.0` (current script binds tailnet IP only — use **100.x** URL).

**Add to home screen:** Chrome → menu → **Install app** / **Add to Home screen** (PWA-style shortcut to the preview).

## 2. SSH from Android (shell access)

**Option A — Tailscale SSH (simplest if enabled on Pi)**

- Install Tailscale; use app’s **SSH** feature if your tailnet allows it (may require browser check once — see `docs/ssh-le-potato-reference.md`).

**Option B — Termux + OpenSSH (key-based, best for automation feel)**

1. Install **Termux** (F-Droid or GitHub build).
2. `pkg update && pkg install openssh`
3. Copy `id_rsa_potato` to `~/.ssh/` (chmod 600) — use SAF/USB or `ssh-copy-id` from PC once.
4. `ssh -i ~/.ssh/id_rsa_potato abhinav@100.122.108.94`

**Option C — JuiceSSH / Termius**

- Import same key; host `100.122.108.94`, user `abhinav`.

If you see **“Tailscale SSH requires an additional check”** on key SSH to **100.x**, on Pi run once: `sudo tailscale set --ssh=false` (documented in `docs/ssh-le-potato-reference.md`) so normal **authorized_keys** works.

## 3. Chat-style interface to the agent (Hermes)

Hermes supports **Telegram, Discord, Slack, WhatsApp, Signal, Email** ([Hermes Agent](https://hermes-agent.nousresearch.com/)). That is the natural **mobile UI** for “talk to the overnight agent”:

1. On linuxbox (one-time): `hermes setup` → connect **Telegram** (or Discord) bot token in `~/.hermes/.env`.
2. Phone uses normal **Telegram app** → messages hit **hermes-gateway** on Pi.
3. Keep **`agent-cycle` cron** for unattended USB/portfolio work; use chat for ad-hoc “status?” or “skip to step 5”.

**Not built yet in this repo:** a custom Android app. Recommended path: **Tailscale + browser** (preview) + **Telegram** (agent) + optional **Termux** (SSH).

## 4. Read agent progress from the phone (no SSH)

If the agent writes to USB:

- Not directly readable on phone unless you SMB/share USB (unlikely).

Better:

- Agent appends to `~/agent-dump/agents/nousagent-progress.md` and USB `progress.md`.
- Serve a **read-only** status file later (future): tiny static page or `tailscale serve` — backlog item for NousAgent lane.

For now: SSH/Termux `tail -20 …/progress.md` or open preview after each major HTML change.

## 5. Checklist after you install Tailscale on Android

- [ ] Tailscale app shows **Connected**
- [ ] Browser opens **http://100.122.108.94:8765/** (portfolio)
- [ ] (Optional) SSH works via Termux or Tailscale SSH
- [ ] (Optional) Telegram bot replies if configured on Pi
- [ ] **Exit node** left **off** at home unless you explicitly want phone internet via home IP

## Related

- [linuxbox-hermes-owl-alpha.md](linuxbox-hermes-owl-alpha.md)
- [ssh-le-potato-reference.md](../ssh-le-potato-reference.md) (phone exit-node section)
- [PORTFOLIO_OVERNIGHT_TASK.md](../../agents/PORTFOLIO_OVERNIGHT_TASK.md)

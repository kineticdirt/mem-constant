# Le Potato SSH reference (saved copy)

This note captures the working **Tailscale + SSH** setup for **`raspbian-bullseye-aml-s905x-cc`** so it is not only in chat history.

## Machine

| Field | Value |
|--------|--------|
| Tailscale IP | `100.122.108.94` |
| MagicDNS | `raspbian-bullseye-aml-s905x-cc` (full name may include `.tail…ts.net` in DNS) |
| LAN (same board as `linuxbox` in SSH config) | `192.168.1.191` |
| User | `abhinav` |
| Private key | **`%USERPROFILE%\.ssh\id_rsa_potato`** (canonical copy; repo `id_rsa_potato` is optional backup — **gitignored**) |

## Commands

### Quick connect (copy-paste)

**Git Bash** (from this repo root — opens the Tailscale check URL in your browser while SSH stays connected):

```bash
cd /c/Users/abhinav/Desktop/MAIN_PROGRAMMING_FILES/agent-dump
bash scripts/tailscale-ssh-open-check-url.sh
```

Approve the page in the browser, then return to the terminal; you should land in a shell on the Pi.

**Git Bash — direct OpenSSH** (you must open the printed `https://login.tailscale.com/a/...` yourself the first time, or after check expiry):

```bash
ssh -i ~/.ssh/id_rsa_potato -o IdentitiesOnly=yes abhinav@100.122.108.94
```

**PowerShell** (same direct path):

```powershell
ssh -i $env:USERPROFILE\.ssh\id_rsa_potato -o IdentitiesOnly=yes abhinav@100.122.108.94
```

**Same LAN as the Pi** (plain OpenSSH + key; no Tailscale SSH check on this path):

```bash
ssh -i ~/.ssh/id_rsa_potato -o IdentitiesOnly=yes abhinav@192.168.1.191
```

If that times out, the PC is not on the Pi’s LAN or the Pi’s LAN IP changed — use the **100.x** path above.

### Fix “Tailscale SSH requires an additional check” for good

That message appears because **`tailscale up --ssh`** makes Tailscale **terminate SSH on the Tailscale IP** and enforce **tailnet identity + ACL “check”** instead of your **`id_rsa_potato`** key. **`BatchMode`** and Cursor agents cannot click the browser link.

**Recommended fix (one command on the Pi, after you have any shell there):**

```bash
sudo tailscale set --ssh=false
```

Then **`ssh -i ~/.ssh/id_rsa_potato abhinav@100.122.108.94`** uses normal **OpenSSH + `authorized_keys`**, so keys and automation work over the tailnet (subject to your tailnet ACL allowing TCP **22** to that node). Re-run **`tailscale up`** without **`--ssh`** if your unit file or scripts still pass it — e.g.:

```bash
sudo tailscale up --accept-dns=true
```

(Add **`--advertise-exit-node`** / **`--advertise-routes=...`** here if you use those features.)

**Alternative:** In [Access controls](https://login.tailscale.com/admin/acls), change **`ssh`** rules from **`"action": "check"`** to **`"action": "accept"`** for the principals you trust — keeps Tailscale SSH on, but weakens the browser gate.

**Tailscale (recommended wrapper):**

```bash
tailscale ssh abhinav@raspbian-bullseye-aml-s905x-cc
```

**Plain OpenSSH with explicit key:**

```bash
ssh -i ~/.ssh/id_rsa_potato -o IdentitiesOnly=yes abhinav@100.122.108.94
```

**SSH config shortcuts** (see `~/.ssh/config` on this PC):

| Host alias | Target |
|------------|--------|
| `potato` | `100.122.108.94` + `id_rsa_potato` |
| `potato-lan` | `192.168.1.191` + `id_rsa_potato` |
| `linuxbox` | `192.168.1.191` + default `id_ed25519` |

```bash
ssh potato
ssh potato-lan
```

## Unblocking “Tailscale SSH requires an additional check”

**Why your private key is not enough (for `ssh user@100.x.x.x`):** With **`tailscale up --ssh`**, Tailscale **handles SSH on port 22 for the Tailscale IP** and authenticates you as a **tailnet user**, not with your `~/.ssh/id_rsa_*` the way normal OpenSSH does on the public internet. The browser prompt is **[check mode](https://tailscale.com/docs/features/tailscale-ssh#check-mode)** in your tailnet **ACL** (default policy often uses `"action": "check"` for SSH to your own devices). Scripts using **`BatchMode=yes`** cannot open that URL.

**Ways to unblock (pick one):**

1. **Approve once (human, interactive SSH)**  
   From your PC, run **`ssh`** / **`tailscale ssh`** **without** `BatchMode`, open the **`https://login.tailscale.com/a/...`** link, sign in, approve. After that, connections from **that client** usually work for the **check period** (often **12 hours** unless your ACL sets `checkPeriod` differently).

2. **Stop using check mode for the paths you care about (tailnet admin)**  
   In [Access controls](https://login.tailscale.com/admin/acls), edit the **`ssh`** rules so the relevant **`src` → `dst`** / **`users`** use **`"action": "accept"`** instead of **`"check"`** (see [Tailscale SSH · Configure](https://tailscale.com/docs/features/tailscale-ssh#configure-tailscale-ssh)). Then tailnet SSH no longer demands the browser step for those rules. **Tradeoff:** weaker than check mode for high‑risk users (e.g. `root`).

3. **Turn off Tailscale SSH on the Pi (use normal OpenSSH + keys over the tailnet)**  
   On **linuxbox** (console or existing shell): **`sudo tailscale set --ssh=false`**  
   Tailscale stops intercepting **:22** on the **100.x** address; **`sshd`** + **`authorized_keys`** behave like classic SSH, so **`ssh -i ~/.ssh/id_rsa_potato abhinav@100.122.108.94`** can authenticate with your key and **automation / `BatchMode`** can work **if** ACLs still allow tailnet TCP to the device on port 22. **Tradeoff:** you lose Tailscale SSH’s ACL‑only auth model for that host; keep **`sshd`** and keys tight.

**LAN:** SSH to **`192.168.1.191`** does **not** go through Tailscale SSH (different path); use **`potato-lan`** when the PC is on the same LAN and you want plain OpenSSH + key only.

**Helper (this repo, Git Bash on Windows):** `scripts/tailscale-ssh-open-check-url.sh` — starts `ssh`, watches stderr for the `login.tailscale.com/a/…` URL, runs **`cmd start`** on it **without** killing `ssh` first, then waits for the session (approve in browser while it runs). Example: `bash scripts/tailscale-ssh-open-check-url.sh "hostname"`

## Exit node (internet egress via this Pi)

Use the Pi as a **Tailscale exit node** so other tailnet devices can send **public internet** traffic out through the Pi’s uplink (home IP). Official background: [Exit nodes](https://tailscale.com/kb/1103/exit-nodes/).

**On the Pi (linuxbox)** — one-time / idempotent:

1. **Kernel forwarding** (Debian): `net.ipv4.ip_forward=1` and IPv6 forwarding as needed. This board already had **`1`** for both when checked (`/proc/sys/net/ipv4/ip_forward`, `/proc/sys/net/ipv6/conf/all/forwarding`).
2. **Advertise exit** (persists in tailscaled prefs):  
   `sudo tailscale set --advertise-exit-node`  
   Equivalent to advertising default routes; `sudo tailscale debug prefs` should list **`AdvertiseRoutes`** including **`0.0.0.0/0`** and **`::/0`**.

**Tailnet admin (you in the browser)** — required or clients will see **no exit nodes**:

1. Open **[Machines](https://login.tailscale.com/admin/machines)** → select **`raspbian-bullseye-aml-s905x-cc`**.
2. Under **Exit node / subnet routes**, **review and approve** the advertised **`0.0.0.0/0`** (and **`::/0`** if shown). Until this is approved, `tailscale exit-node list` on Windows stays empty.

**On a client (e.g. this Windows PC)** — after approval:

- Tray: **Tailscale icon → Use exit node →** pick **`raspbian-bullseye-aml-s905x-cc`**, or  
- CLI (run from an elevated shell if your install requires it):  
  `tailscale set --exit-node=raspbian-bullseye-aml-s905x-cc`  
  Clear with: `tailscale set --exit-node=`  
- Optional LAN bypass while on exit: `tailscale set --exit-node-allow-lan-access=true` (see Tailscale docs for tradeoffs).

**Employer / coffee-shop policy:** routing all traffic through your home is powerful; only use where policy allows.

## Security

- Do **not** commit `id_rsa_potato` to git (see repo `.gitignore`).
- If a key is ever committed, **rotate** it on the Pi (`authorized_keys`) and generate a new key.

## Server persistence (linuxbox / Le Potato stays on)

Applied on **`raspbian-bullseye-aml-s905x-cc`** via SSH (so this works when your **desktop PC is off** — use another tailnet device + the same key, or `tailscale ssh`).

| Check | Status |
|--------|--------|
| `tailscaled` on boot | **`enabled`** (`systemctl enable tailscaled`) |
| `ssh` (sshd) on boot | **`enabled`** (`systemctl enable ssh`) |
| Tailscale session | `tailscale up --ssh --accept-dns=true` (prefs: **`RunSSH`: true**, **`WantRunning`: true**, **`LoggedOut`: false**) |
| OpenSSH | Listens **`0.0.0.0:22`** and **`[::]:22`**; `ListenAddress` lines commented (all interfaces) |
| Host firewall | **`ufw` not active** on this image (no extra rule needed for :22 here) |

Tailscale version on device: **1.96.4** (control plane `https://controlplane.tailscale.com`).

## Last updated

- **2026-05-14** — **Exit node** — `sudo tailscale set --advertise-exit-node` on Pi; doc § for **admin approval** + Windows client `tailscale set --exit-node=…`.
- **2026-04-19** — **Quick connect** (Git Bash / PowerShell / LAN) + **fix Tailscale SSH check** (`tailscale set --ssh=false`, `tailscale up` without `--ssh`).
- **2026-04-16** — **`scripts/tailscale-ssh-open-check-url.sh`** — open check URL while keeping `ssh` alive (Git Bash + Windows `start`).
- **2026-04-16** — Expanded § Unblocking Tailscale SSH (check vs accept, `tailscale set --ssh=false`, why keys differ on 100.x).
- **2026-04-16** — Reference saved; canonical key path `~/.ssh/id_rsa_potato` on Windows.
- **2026-04-16** — Remote persistence: `tailscaled` + `ssh` enabled; `tailscale up --ssh`; doc table above.

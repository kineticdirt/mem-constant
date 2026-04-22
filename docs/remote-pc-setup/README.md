# Remote PC setup (Apollo + Moonlight + RustDesk + Tailscale)

**Repo copy:** synced from **`E:\RemotePC-Setup\`** on **2026-04-21** for portability in git. Prefer refreshing from that folder when you change winget IDs, IPs, or script paths on disk.

**Name check:** the streaming **client** is **[Moonlight](https://moonlight-stream.org/)** (open GameStream-style client). It is not “Midnight.”

This folder on **E:\** is your **offline reference**: install steps, two-way streaming, backup remote control, and where automation scripts live in the **Linuxbox** repo.

**Canonical scripts (update when the repo changes):**

`D:\CS_and_Programming\Linuxbox\remote-stream-companion\`

---

## Roles

| Piece | Role |
|--------|------|
| **Tailscale** | Private mesh (**100.x**). Prefer this for “away” paths; no port-forward to the public internet for streaming. |
| **Apollo** | **Host** on each Windows PC (GameStream-style stream for Moonlight). Web UI default: `https://127.0.0.1:47990` |
| **Moonlight** | **Client** on each PC (and phone, etc.). Add each other by **LAN IP** and/or **Tailscale IP**. |
| **RustDesk** | **Backup** when Apollo/Moonlight fails (driver, black screen, pairing). Not the primary gaming path. |

**Two-way:** each PC runs **Apollo** (others connect in) and **Moonlight** (you connect out).

---

## Install (Windows, both PCs)

Run in **elevated PowerShell** if `winget` asks for elevation.

**Tailscale** (if not already):

- Install from [https://tailscale.com/download/windows](https://tailscale.com/download/windows)  
- CLI: `"%ProgramFiles%\Tailscale\tailscale.exe" status`  
- Per-machine IPv4: `"%ProgramFiles%\Tailscale\tailscale.exe" ip -4`

**Moonlight (client):**

```text
winget install -e --id MoonlightGameStreamingProject.Moonlight --accept-source-agreements --accept-package-agreements
```

Default path: `C:\Program Files\Moonlight Game Streaming\Moonlight.exe`

**Apollo (host):**

```text
winget install -e --id ClassicOldSong.Apollo --accept-source-agreements --accept-package-agreements
```

Service: **ApolloService** (process may show as **sunshinesvc**). Listening ports often include **47984**, **47989**, **47990**, **48010**.

**RustDesk (optional backup):**

- If `winget` has no package on your PC, install from [https://rustdesk.com](https://rustdesk.com) (Windows x64).  
- Exchange **ID** / password once per direction if you want mutual access.

---

## First-time Apollo + Moonlight (each PC)

1. Open Apollo’s web UI on that PC (from the repo, run `Open-ApolloWebUI.ps1`, or open `https://127.0.0.1:47990` in a browser). Complete admin password and any first-run steps.  
2. On the **other** PC, open **Moonlight** → **Add PC** → enter the first PC’s **LAN** or **Tailscale 100.x** address.  
3. Enter the **PIN** shown in Apollo’s web UI to pair.  
4. Repeat swapping roles so **both** PCs are added in **both** Moonlight clients (use two entries per peer if you want different quality for LAN vs Tailscale).

**LAN IP (this laptop example):** Wi‑Fi `192.168.4.27` — use `Get-NetAdapter` / `ipconfig` on each machine for current values.

**Tailscale (examples from your tailnet):**

| Machine | Tailscale IPv4 |
|---------|----------------|
| abhi-m15-laptop | 100.77.115.62 |
| desktop-igqesd4 | 100.96.132.49 |

Confirm with `tailscale status` — offline peers cannot be streamed to until they are online.

---

## Companion scripts (WoL + launch Moonlight / RustDesk)

From repo root:

`D:\CS_and_Programming\Linuxbox\remote-stream-companion`

1. Copy **`config.example.psd1`** from **E:\RemotePC-Setup** (or from the repo) to **`config.psd1`** in `remote-stream-companion` (same folder as `scripts\`). Edit **`Peers`**, **`DefaultPeer`**, **`WakeMac`**.  
2. **Laptop** (connect to desktop by default): `DefaultPeer = "Desktop"`.  
3. **Desktop** (connect to laptop by default): `DefaultPeer = "Laptop"` and set each peer’s `StreamHost` / `WakeMac` accordingly.

**Run (examples):**

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\CS_and_Programming\Linuxbox\remote-stream-companion\scripts\Connect-RemotePC.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\CS_and_Programming\Linuxbox\remote-stream-companion\scripts\Connect-RemotePC.ps1 -PeerName Desktop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\CS_and_Programming\Linuxbox\remote-stream-companion\scripts\Connect-RustDesk.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\CS_and_Programming\Linuxbox\remote-stream-companion\scripts\Open-ApolloWebUI.ps1
```

**Wake-on-LAN:** `WakeMac` must be the **target** PC’s NIC MAC (`Get-NetAdapter -Physical`). Wi‑Fi WoL is often unreliable; Ethernet is better for WoL.

---

## Firewall and security

- Allow **Apollo** / **Moonlight** / **RustDesk** on **Private** networks and on the **Tailscale** adapter where Windows asks.  
- Prefer **no** inbound rules that expose Apollo to the **public** internet; use **Tailscale** for remote reachability.

---

## Moonlight quality (LAN vs away)

Moonlight does not auto-switch profiles by network. Common pattern: **two Moonlight “PC” entries** for the same machine — one with **LAN IP** (high quality), one with **100.x** (e.g. 1080p / lower bitrate).

---

## Files in this E:\RemotePC-Setup folder

| File | Purpose |
|------|--------|
| `README.md` | This document (master instructions). |
| `config.example.psd1` | Template for `remote-stream-companion\config.psd1` (copy and edit per PC). |
| `REPO-LOCATION.txt` | Path to Linuxbox `remote-stream-companion` on disk. |

---

## Links

- Moonlight: [https://moonlight-stream.org/](https://moonlight-stream.org/)  
- Apollo: [https://github.com/ClassicOldSong/Apollo](https://github.com/ClassicOldSong/Apollo)  
- Sunshine (alternative host): [https://github.com/LizardByte/Sunshine](https://github.com/LizardByte/Sunshine)  
- Tailscale: [https://tailscale.com/](https://tailscale.com/)  
- RustDesk: [https://rustdesk.com/](https://rustdesk.com/)  
- Moonlight (Android / F-Droid): [https://f-droid.org/packages/com.limelight/](https://f-droid.org/packages/com.limelight/)

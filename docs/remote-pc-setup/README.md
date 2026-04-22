# Remote PC setup (Apollo + Moonlight + RustDesk + Tailscale)

**E:\RemotePC-Setup** (removable drive, **2026-04-22**): cleaned to **`CUSTOMER COPIES.pdf`** plus this folder; contains **`START-HERE-LAPTOP.txt`**, **`CONNECTION-SUMMARY.txt`**, **`SETUP-REFERENCE.md`**, and **`scripts\`** with the same PowerShell helpers as the repo plus **pre-filled `config.psd1`** for laptop-first use. Re-copy from **`scripts/remote-stream-companion/`** in git when scripts change.

**Name check:** the streaming **client** is **[Moonlight](https://moonlight-stream.org/)** (open GameStream-style client). It is not “Midnight.”

**Implemented in this repo (run these first):**

`scripts/remote-stream-companion/` — **`Connect-RemotePC.ps1`**, **`Open-ApolloWebUI.ps1`**, **`Connect-RustDesk.ps1`**, **`config.example.psd1`** (copy → **`config.psd1`**). See that folder’s **`README.md`**.

**Optional duplicate on disk (your older path):**

`D:\CS_and_Programming\Linuxbox\remote-stream-companion\` — keep in sync with git if you still use it.

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

**In-repo path** (clone root → `scripts\remote-stream-companion\`):

1. Copy **`config.example.psd1`** → **`config.psd1`** in that same folder. Edit **`Peers`**, **`DefaultPeer`**, **`WakeMac`**.  
2. **Laptop** (connect to desktop by default): `DefaultPeer = "Desktop"`.  
3. **Desktop** (connect to laptop by default): `DefaultPeer = "Laptop"` and set each peer’s `StreamHost` / `WakeMac` accordingly.

**Run (examples)** — adjust the drive/path to your **`agent-dump`** clone:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\remote-stream-companion\Connect-RemotePC.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\remote-stream-companion\Connect-RemotePC.ps1 -PeerName Desktop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\remote-stream-companion\Connect-RustDesk.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\remote-stream-companion\Open-ApolloWebUI.ps1
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

## Files (E:\ mirror vs repo)

| Location | Purpose |
|----------|--------|
| **`docs/remote-pc-setup/README.md`** (this file) | Master instructions + links to scripts. |
| **`scripts/remote-stream-companion/config.example.psd1`** | Template → copy to **`config.psd1`** next to the `.ps1` scripts. |
| **`E:\RemotePC-Setup\`** | Offline copy on your thumb drive; refresh **`docs/remote-pc-setup`** / **`scripts/remote-stream-companion`** when you change winget steps or IPs. |
| **`REPO-LOCATION.txt`** | Legacy path to Linuxbox clone on **D:\\** (optional). |

---

## Links

- Moonlight: [https://moonlight-stream.org/](https://moonlight-stream.org/)  
- Apollo: [https://github.com/ClassicOldSong/Apollo](https://github.com/ClassicOldSong/Apollo)  
- Sunshine (alternative host): [https://github.com/LizardByte/Sunshine](https://github.com/LizardByte/Sunshine)  
- Tailscale: [https://tailscale.com/](https://tailscale.com/)  
- RustDesk: [https://rustdesk.com/](https://rustdesk.com/)  
- Moonlight (Android / F-Droid): [https://f-droid.org/packages/com.limelight/](https://f-droid.org/packages/com.limelight/)

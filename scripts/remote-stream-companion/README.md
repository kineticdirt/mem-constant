# Remote stream companion (Windows)

Runnable implementation of the **Apollo + Moonlight** helper flow described in [`docs/remote-pc-setup/README.md`](../../docs/remote-pc-setup/README.md).

## One-time setup

1. Install **Tailscale**, **Moonlight**, **Apollo** on **both** PC and laptop (see doc above).
2. In this folder, copy **`config.example.psd1`** → **`config.psd1`**.
3. Edit **`config.psd1`**: `DefaultPeer`, each peer’s **`StreamHost`** (LAN or Tailscale `100.x`), and **`WakeMac`** (`Get-NetAdapter -Physical` on the *target* PC). All-zero `WakeMac` skips WoL.

## Run

From **PowerShell** (paths match your clone location):

```powershell
Set-Location "C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\remote-stream-companion"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Connect-RemotePC.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Connect-RemotePC.ps1 -PeerName Laptop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Open-ApolloWebUI.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Connect-RustDesk.ps1
```

**Laptop** usually sets `DefaultPeer = "Desktop"`. **Desktop** sets `DefaultPeer = "Laptop"`.

### Wake desktop from sleep (remote)

1. On **desktop**: `Enable-DesktopWake.ps1` (admin) — arms Wi‑Fi/Ethernet for magic-packet wake.
2. In `config.psd1`: `WakeRelay` points at **linuxbox** (`100.122.108.94`) for away-from-home WoL.
3. On **laptop**: `Connect-RemotePC.ps1` — SSH → linuxbox WoL → wait for Apollo → Moonlight.

`config.psd1` is gitignored so machine-specific IPs/MACs stay local.

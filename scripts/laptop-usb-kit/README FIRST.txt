README FIRST — laptop tailnet + remote kit (500MB USB)
==============================================================

Prepared on DESKTOP. Plug into the LAPTOP.

FASTEST PATH (one click, does everything):
  Double-click  SETUP-EVERYTHING-Admin.cmd  (drive root).
  - It asks for Administrator (click Yes), then auto-detects the machine:
      * On the LAPTOP: installs Tailscale + Moonlight (+ Git), installs the SSH
        key, writes SSH config, starts Tailscale login, opens Moonlight for
        pairing, and verifies the path to the desktop.
      * On the DESKTOP: ensures Apollo + Tailscale are up/auto-start, arms
        wake-from-sleep, opens the key-expiry admin page.
  - Safe to re-run. Read the [OK]/[WARN]/[FAIL] summary at the end.
  - Still finish the two MANUAL one-time items below (pairing PIN + key expiry).

OPEN NEXT (manual / reference):
  FROM-SCRATCH-LAPTOP.md   (full step-by-step)
  APOLLO-LOGIN.txt         (Apollo password + Moonlight pairing for full desktop control)

IMPORTANT — PowerShell scripts on Windows:
  Windows often blocks .ps1 files ("running scripts is disabled").
  You do NOT need to change system settings. Use either:

  A) Double-click the .cmd files in scripts\  (easiest)
     Verify-Tailnet.cmd
     Run-From-Laptop.cmd
     Test-RemoteTailnet.cmd

  B) Run from PowerShell with Bypass (one command):
     powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\scripts\Verify-Tailnet.ps1

  Replace E: with your USB drive letter. See POWERSHELL-SCRIPTS.txt

On the LAPTOP, in order:
  1. Tailscale
  2. SSH key  ->  copy secrets\id_rsa_potato to %USERPROFILE%\.ssh\
  3. SSH config  ->  scripts\ssh-config-snippet.txt into ~/.ssh/config
  4. Test  ->  double-click scripts\Verify-Tailnet.cmd
  5. Remote in  ->  ssh potato  OR  scripts\Run-From-Laptop.cmd
  6. Pixi RP only (browser)  ->  ObsidianWriterStack\scripts\Open-PixiRP.cmd
  7. Hotspot test  ->  scripts\Test-RemoteTailnet.cmd

ONE-TIME MUST-DO (for remote desktop viewing over the internet):
  * Disable Tailscale KEY EXPIRY (any browser):
      https://login.tailscale.com/admin/machines
      -> desktop-igqesd4 -> ... -> Disable key expiry  (repeat for linuxbox)
    Otherwise the desktop drops off the tailnet mid-trip = locked out.
  * PAIR Moonlight to the desktop ONCE at home (desktop awake):
      Moonlight -> Add PC -> desktop-igqesd4 (or 100.118.226.87)
      -> enter PIN in Apollo web UI on desktop (https://127.0.0.1:47990)
    After pairing, full-screen streaming works from ANY network.
  Details in FROM-SCRATCH-LAPTOP.md (Step 5B).

Home: linuxbox on (100.122.108.94)
Desktop when you leave: SLEEP not Shutdown

See DESKTOP-PREP-DONE.txt

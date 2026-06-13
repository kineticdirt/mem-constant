README FIRST — laptop tailnet + remote kit (500MB USB)
==============================================================

Prepared on DESKTOP. Plug into the LAPTOP.

OPEN NEXT:
  FROM-SCRATCH-LAPTOP.md

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

Home: linuxbox on (100.122.108.94)
Desktop when you leave: SLEEP not Shutdown

See DESKTOP-PREP-DONE.txt

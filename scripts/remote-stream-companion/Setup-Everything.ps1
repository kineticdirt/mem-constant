#Requires -Version 5.1
<#
  Setup-Everything.ps1 - one-shot remote-control setup, machine-aware.

  Run via SETUP-EVERYTHING-Admin.cmd (self-elevates to Administrator).

  - On the LAPTOP: installs Tailscale + Moonlight (+ Git), installs the SSH key,
    writes the SSH config, starts Tailscale login, opens Moonlight for pairing,
    then verifies the tailnet path to the desktop.
  - On the DESKTOP (Apollo host): ensures Apollo + Tailscale are running and set
    to auto-start, arms wake-from-sleep, and opens the admin console so you can
    disable key expiry.

  Idempotent: safe to re-run. Never aborts the whole flow on a single failure;
  each step reports [OK] / [WARN] / [FAIL] and a summary prints at the end.
#>
param(
    [switch]$NoVerify
)

$ErrorActionPreference = 'Continue'

$Root   = $PSScriptRoot                          # ...\scripts
$Usb    = Split-Path $Root -Parent               # drive root
$Secret = Join-Path $Usb 'secrets\id_rsa_potato'
$Ts     = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$TsGui  = Join-Path $env:ProgramFiles 'Tailscale\tailscale-ipn.exe'

$DesktopName = 'desktop-igqesd4'
$DesktopIp   = '100.118.226.87'
$LinuxboxIp  = '100.122.108.94'
$Account     = 'abhinavall0123@gmail.com'
$AdminUrl    = 'https://login.tailscale.com/admin/machines'
$ApolloUi    = 'https://127.0.0.1:47990'

$script:results = @()
function Section($t) { Write-Host "`n==== $t ====" -ForegroundColor Cyan }
function OK($m)   { Write-Host "[OK]   $m" -ForegroundColor Green;  $script:results += "[OK]   $m" }
function WARN($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow; $script:results += "[WARN] $m" }
function FAIL($m) { Write-Host "[FAIL] $m" -ForegroundColor Red;    $script:results += "[FAIL] $m" }
function Info($m) { Write-Host "       $m" -ForegroundColor Gray }

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Winget($id, $present) {
    if ($present) { OK "$id already installed"; return }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        FAIL "winget not available - install '$id' manually"; return
    }
    Write-Host "       installing $id ..." -ForegroundColor Gray
    try {
        winget install -e --id $id --accept-source-agreements --accept-package-agreements `
            --disable-interactivity 2>&1 | Out-Host
        OK "$id install attempted"
    } catch { FAIL "winget install $id : $($_.Exception.Message)" }
}

Write-Host "===== Remote-control setup =====" -ForegroundColor White
if (-not (Test-Admin)) { WARN 'Not elevated - some steps may fail. Use SETUP-EVERYTHING-Admin.cmd.' }

$IsDesktop = (Test-Path 'C:\Program Files\Apollo\sunshine.exe') -or ($env:COMPUTERNAME -ieq 'DESKTOP-IGQESD4')
Write-Host ("Detected machine: {0}  (host {1})" -f $(if ($IsDesktop) { 'DESKTOP (Apollo host)' } else { 'LAPTOP (client)' }), $env:COMPUTERNAME) -ForegroundColor Magenta

# ---------------------------------------------------------------- DESKTOP flow
if ($IsDesktop) {
    Section 'Apollo host service'
    $apollo = Get-Service -Name 'ApolloService' -ErrorAction SilentlyContinue
    if ($apollo) {
        try { sc.exe config ApolloService start= auto | Out-Null } catch {}
        if ($apollo.Status -ne 'Running') { try { Start-Service ApolloService } catch {} }
        $apollo.Refresh()
        if ((Get-Service ApolloService).Status -eq 'Running') { OK 'ApolloService running (auto-start)' }
        else { FAIL 'ApolloService not running - open Apollo and start it' }
    } else { FAIL 'Apollo not installed on this desktop' }

    Section 'Tailscale'
    if (Test-Path $Ts) {
        try { & $Ts up 2>&1 | Out-Null } catch {}
        $st = (& $Ts status 2>&1 | Out-String)
        if ($st -match $LinuxboxIp) { OK 'Tailscale up; linuxbox visible' }
        elseif ($st -match 'Logged out') { WARN 'Tailscale logged out - launching login'; Start-Process $Ts -ArgumentList 'login' }
        else { WARN 'Tailscale state unclear - check the tray icon' }
    } else { FAIL 'Tailscale not installed' }

    Section 'Wake-from-sleep'
    $wake = Join-Path $Root 'Enable-DesktopWake.ps1'
    if (Test-Path $wake) {
        try { & $wake; OK 'Wake-on-LAN armed (Enable-DesktopWake.ps1)' }
        catch { FAIL "Enable-DesktopWake.ps1: $($_.Exception.Message)" }
    } else { WARN 'Enable-DesktopWake.ps1 not on USB' }

    Section 'Pairing + key expiry (manual, one-time)'
    Info "Pair the laptop: on laptop Moonlight add  $DesktopName  (or $DesktopIp),"
    Info "then enter its PIN in Apollo web UI: $ApolloUi  (user apollo)."
    Info "Disable key expiry so the link survives travel:"
    Info "  $AdminUrl  ->  $DesktopName  ->  ...  ->  Disable key expiry  (also linuxbox)"
    try { Start-Process $AdminUrl } catch {}
    try { Start-Process $ApolloUi } catch {}

    Info ''
    Info "Leave this desktop in SLEEP (not Shutdown) when you travel."
}

# ----------------------------------------------------------------- LAPTOP flow
else {
    Section 'Install Tailscale + Moonlight + Git'
    Invoke-Winget 'Tailscale.Tailscale' (Test-Path $Ts)
    $moonInstalled = (Test-Path "$env:ProgramFiles\Moonlight Game Streaming\Moonlight.exe") -or
                     (Test-Path "${env:ProgramFiles(x86)}\Moonlight Game Streaming\Moonlight.exe")
    Invoke-Winget 'MoonlightGameStreamingProject.Moonlight' $moonInstalled
    Invoke-Winget 'Git.Git' ([bool](Get-Command git -ErrorAction SilentlyContinue))

    Section 'SSH key'
    $sshDir = Join-Path $env:USERPROFILE '.ssh'
    if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Force -Path $sshDir | Out-Null }
    if (Test-Path $Secret) {
        $dest = Join-Path $sshDir 'id_rsa_potato'
        Copy-Item -Force $Secret $dest
        try {
            icacls $dest /inheritance:r 2>&1 | Out-Null
            icacls $dest /grant:r "$($env:USERNAME):R" 2>&1 | Out-Null
            OK "SSH key installed + locked down: $dest"
        } catch { WARN "Key copied but ACL lockdown failed: $dest" }
    } else { FAIL "SSH key missing on USB: $Secret" }

    Section 'SSH config'
    $cfg = Join-Path $sshDir 'config'
    $snippet = Join-Path $Root 'ssh-config-snippet.txt'
    if (Test-Path $snippet) {
        $have = (Test-Path $cfg) -and ((Get-Content $cfg -Raw) -match 'Host\s+potato')
        if ($have) { OK 'SSH config already has potato host' }
        else {
            Add-Content -Path $cfg -Value "`n$(Get-Content $snippet -Raw)"
            OK "Appended potato host to $cfg"
        }
    } else { WARN 'ssh-config-snippet.txt not on USB' }

    Section 'Tailscale login'
    if (Test-Path $Ts) {
        $st = (& $Ts status 2>&1 | Out-String)
        if ($st -match $LinuxboxIp) { OK 'Already on tailnet; linuxbox visible' }
        else {
            WARN "Sign in with $Account when the browser/login opens"
            if (Test-Path $TsGui) { try { Start-Process $TsGui } catch {} }
            try { Start-Process $Ts -ArgumentList 'login' } catch {}
            Info 'Approve this device in the browser, then re-run to verify.'
        }
    } else { FAIL 'Tailscale not installed - re-run after install completes' }

    Section 'Moonlight pairing'
    Info "1) Open Moonlight -> Add PC -> $DesktopName  (or $DesktopIp)"
    Info "2) On the DESKTOP, open Apollo web UI $ApolloUi (user apollo) -> PIN -> type Moonlight's PIN"
    Info "3) Click the desktop in Moonlight -> Desktop  = full screen control"
    $moonExe = @("$env:ProgramFiles\Moonlight Game Streaming\Moonlight.exe",
                 "${env:ProgramFiles(x86)}\Moonlight Game Streaming\Moonlight.exe") |
                Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($moonExe) { try { Start-Process $moonExe } catch {} }

    Section 'Key expiry reminder (one-time, any browser)'
    Info "Disable key expiry so the desktop never drops off mid-trip:"
    Info "  $AdminUrl -> $DesktopName -> ... -> Disable key expiry  (also linuxbox)"
    try { Start-Process $AdminUrl } catch {}

    if (-not $NoVerify) {
        Section 'Verify tailnet path'
        $test = Join-Path $Root 'Test-RemoteTailnet.ps1'
        if (Test-Path $test) { & $test -SkipMoonlight }
        else { WARN 'Test-RemoteTailnet.ps1 not on USB' }
    }
}

# --------------------------------------------------------------------- summary
Section 'Summary'
$script:results | ForEach-Object { Write-Host $_ }
$fails = ($script:results | Where-Object { $_ -like '[FAIL]*' }).Count
if ($fails -eq 0) { Write-Host "`nAll core steps OK." -ForegroundColor Green }
else { Write-Host "`n$fails step(s) need attention - see [FAIL] above." -ForegroundColor Red }

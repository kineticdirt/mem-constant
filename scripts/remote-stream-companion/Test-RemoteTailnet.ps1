#Requires -Version 5.1
<#
.SYNOPSIS
  End-to-end remote tailnet test (run from laptop OR desktop on outside network / hotspot).

.DESCRIPTION
  Verifies: Tailscale, linuxbox SSH, WoL relay, desktop Apollo port, optional wake test.
  Use before traveling: connect laptop/phone to phone hotspot (not home Wi-Fi), then run this.

.PARAMETER WakeDesktop
  Send WoL via linuxbox (desktop should be asleep to test wake).

.PARAMETER SkipMoonlight
  Do not launch Moonlight at the end.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\Test-RemoteTailnet.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\Test-RemoteTailnet.ps1 -WakeDesktop
#>
param(
    [switch]$WakeDesktop,
    [switch]$SkipMoonlight
)

$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\RemoteStreamCommon.ps1"

$ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$linuxboxIp = '100.122.108.94'
$desktopIp = '100.118.226.87'
$apolloPort = 47984
$fail = 0

function Step($label, $ok, $detail) {
    $mark = if ($ok) { '[PASS]' } else { '[FAIL]' }
    $color = if ($ok) { 'Green' } else { 'Red' }
    Write-Host "$mark $label" -ForegroundColor $color
    if ($detail) { Write-Host "       $detail" }
    if (-not $ok) { $script:fail++ }
}

Write-Host "`n=== Remote tailnet test ===" -ForegroundColor Cyan
Write-Host "Run this while NOT on home Wi-Fi (phone hotspot) for a real outside-network test.`n"

Step 'Tailscale installed' (Test-Path $ts) $ts

if (Test-Path $ts) {
    $status = & $ts status 2>&1 | Out-String
    Write-Host $status
    Step 'This machine on tailnet' ($status -match '100\.\d+\.\d+\.\d+')
    Step 'linuxbox online' ($status -match '100\.122\.108\.94' -and $status -notmatch '100\.122\.108\.94.*offline')
    $desktopIpRegex = [regex]::Escape($desktopIp)
    Step 'desktop in tailnet' ($status -match $desktopIpRegex)
    $desktopOnline = $status -match $desktopIpRegex -and $status -notmatch "$desktopIpRegex.*offline"
    Step 'desktop online now' $desktopOnline 'Expected OFF if testing wake-from-sleep'
}

$key = Join-Path $env:USERPROFILE '.ssh\id_rsa_potato'
Step 'SSH key present' (Test-Path $key) $key

if (Test-Path $key) {
    $sshOut = ssh -i $key -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 "abhinav@$linuxboxIp" "echo SSH_OK && hostname && test -x ~/bin/wake-desktop.sh && echo WAKE_SCRIPT_OK" 2>&1 | Out-String
    Write-Host $sshOut.TrimEnd()
    Step 'SSH to linuxbox' ($sshOut -match 'SSH_OK')
    Step 'wake-desktop.sh on linuxbox' ($sshOut -match 'WAKE_SCRIPT_OK')
}

if (Test-Path $ts) {
    $pingOut = & $ts ping -c 2 $linuxboxIp 2>&1 | Out-String
    Write-Host $pingOut.TrimEnd()
    Step 'tailscale ping linuxbox' ($LASTEXITCODE -eq 0)
}

$config = Read-RemoteStreamConfig
if (-not $config) {
    Step 'config.psd1' $false 'Copy config.example.psd1 to config.psd1'
} else {
    Step 'config.psd1 loaded' $true
    $relay = Get-WakeRelaySettings -Config $config
    Step 'WakeRelay configured' ($null -ne $relay)
    if ($WakeDesktop -and $relay -and $config.Peers.Desktop.WakeMac) {
        $mac = $config.Peers.Desktop.WakeMac
        Write-Host "`nSending WoL via linuxbox for $mac ..."
        $woke = Send-WakeOnLanViaLinuxbox -MacAddress $mac -Relay $relay
        Step 'WoL sent via linuxbox' $woke
        Write-Host 'Waiting 60s for desktop boot...'
        Start-Sleep -Seconds 60
    }
}

if (Test-Path $ts) {
    $pingDesk = & $ts ping -c 2 $desktopIp 2>&1 | Out-String
    Write-Host $pingDesk.TrimEnd()
    Step 'tailscale ping desktop' ($LASTEXITCODE -eq 0)
}

$apolloOk = $false
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($desktopIp, $apolloPort, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(5000)) {
        $client.EndConnect($iar)
        $apolloOk = $true
    }
    $client.Close()
} catch { }
Step "Apollo port $desktopIp`:$apolloPort" $apolloOk 'Start ApolloService on desktop if FAIL'

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($fail -eq 0) {
    Write-Host 'All checks passed. Tailnet path is ready for remote use.' -ForegroundColor Green
} else {
    Write-Host "$fail check(s) failed. Fix before you travel." -ForegroundColor Yellow
}

if (-not $SkipMoonlight -and $apolloOk -and $config) {
    $moon = $config.MoonlightPath
    if ($moon -and (Test-Path $moon)) {
        Write-Host 'Launching Moonlight...'
        Start-Process -FilePath $moon
    }
}

exit $(if ($fail -eq 0) { 0 } else { 1 })

<#
.SYNOPSIS
  Wake peer (optional), wait for Apollo stream port, launch Moonlight.

.DESCRIPTION
  Loads config.psd1 from this script directory. Uses DefaultPeer or -PeerName.
  After Moonlight opens, pick the paired PC matching StreamHost (Tailscale or LAN).

.PARAMETER PeerName
  Key in config Peers (e.g. Desktop, Laptop). Defaults to config DefaultPeer.
#>
param(
    [string]$PeerName
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\RemoteStreamCommon.ps1"

$config = Read-RemoteStreamConfig
if (-not $config) { exit 1 }

$name = $PeerName
if ([string]::IsNullOrWhiteSpace($name)) {
    $name = $config.DefaultPeer
}
if ([string]::IsNullOrWhiteSpace($name)) {
    Write-Error 'Set DefaultPeer in config.psd1 or pass -PeerName.'
    exit 1
}
if (-not $config.Peers.ContainsKey($name)) {
    Write-Error "Unknown peer '$name'. Keys: $($config.Peers.Keys -join ', ')"
    exit 1
}

$peer = $config.Peers[$name]
$hostName = $peer.StreamHost
$wakeMac = $peer.WakeMac
$port = [int]($config.StreamCheckPort)
if (-not $port) { $port = 47984 }

$wakeWait = [int]($config.WakeWaitSeconds)
if (-not $wakeWait) { $wakeWait = 45 }
$maxRetries = [int]($config.MaxRetries)
if (-not $maxRetries) { $maxRetries = 8 }
$retrySec = [int]($config.RetryIntervalSeconds)
if (-not $retrySec) { $retrySec = 10 }

Write-Host "[remote-stream] Target peer: $name  StreamHost: $hostName  Port: $port"

if (-not (Test-IsPlaceholderMac -Mac $wakeMac)) {
    [void](Send-WakeOnLan -MacAddress $wakeMac)
    Write-Host "[remote-stream] Waiting ${wakeWait}s after WoL before probing port..."
    Start-Sleep -Seconds $wakeWait
}

[void](Wait-RemoteStreamPort -HostName $hostName -Port $port -MaxRetries $maxRetries -RetryIntervalSeconds $retrySec)

$moon = $config.MoonlightPath
if ([string]::IsNullOrWhiteSpace($moon) -or -not (Test-Path -LiteralPath $moon)) {
    Write-Error "MoonlightPath not found: $moon. Set MoonlightPath in config.psd1."
    exit 1
}

Write-Host "[remote-stream] Starting Moonlight. Connect to $hostName (or your existing paired entry for that host)."
Start-Process -FilePath $moon

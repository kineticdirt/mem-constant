#Requires -Version 5.1
<#
.SYNOPSIS
  Enable advertised exit-node routes (0.0.0.0/0, ::/0) for linuxbox on the tailnet control plane.

.DESCRIPTION
  The Pi must already run: sudo tailscale set --advertise-exit-node
  This script calls the Tailscale API to approve those routes (same effect as the admin console).

  Create an API key at https://login.tailscale.com/admin/settings/keys with permission to manage
  devices / routes (Tailscale documents this under the Tailscale API).

  Usage (do not paste the key into git or chat):
    $env:TAILSCALE_API_KEY = 'tskey-api-...'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/approve_tailscale_linuxbox_exit_routes.ps1

  Optional: also route this PC through the exit node:
    ... -File scripts/approve_tailscale_linuxbox_exit_routes.ps1 -UseExitNodeOnThisPc
#>
param(
  [string] $DeviceId = "nWnqYHjsCB11CNTRL",
  [switch] $UseExitNodeOnThisPc
)

$ErrorActionPreference = "Stop"
$key = $env:TAILSCALE_API_KEY
if (-not $key -or $key.Length -lt 10) {
  Write-Error "Set environment variable TAILSCALE_API_KEY to a tskey-api-... key from https://login.tailscale.com/admin/settings/keys"
  exit 1
}

$pair = "${key}:"
$b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{
  Authorization = "Basic $b64"
}
$base = "https://api.tailscale.com/api/v2/device/$DeviceId"
$bodyObj = @{ routes = @("0.0.0.0/0", "::/0") }
$body = $bodyObj | ConvertTo-Json -Compress

Write-Host "GET $base/routes (before)"
$before = Invoke-RestMethod -Uri "$base/routes" -Headers $headers -Method Get
$before | ConvertTo-Json -Depth 5

Write-Host "`nPOST $base/routes (enable advertised defaults)"
$after = Invoke-RestMethod -Uri "$base/routes" -Headers $headers -Method Post -ContentType "application/json" -Body $body
$after | ConvertTo-Json -Depth 5

Write-Host "`nVerify on this machine: tailscale exit-node list"
& tailscale exit-node list

if ($UseExitNodeOnThisPc) {
  Write-Host "`nSetting this PC to use exit node raspbian-bullseye-aml-s905x-cc ..."
  & tailscale set --exit-node=raspbian-bullseye-aml-s905x-cc
  & tailscale status | Select-Object -First 12
}

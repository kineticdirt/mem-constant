#Requires -Version 5.1
<#
.SYNOPSIS
  Approve advertised exit-node routes (0.0.0.0/0, ::/0) for linuxbox on the Tailscale control plane.

.DESCRIPTION
  Only **linuxbox** (the Pi) should act as the tailnet **exit node** — i.e. the machine that *offers*
  default-route egress. This script does **not** change any client; it only enables the routes
  Tailscale already sees advertised from that device (same as approving in the admin console).

  The Pi must already run: sudo tailscale set --advertise-exit-node

  Create an API key at https://login.tailscale.com/admin/settings/keys with permission to manage
  device routes (see Tailscale API docs).

  Usage (do not paste the key into git or chat):
    $env:TAILSCALE_API_KEY = 'tskey-api-...'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/approve_tailscale_linuxbox_exit_routes.ps1

  To **use** the exit node from a specific device (phone, laptop, etc.), enable "Use exit node"
  on that device only — not required on your desktop build box unless you want it.
#>
param(
  [string] $DeviceId = "nWnqYHjsCB11CNTRL"
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

Write-Host "`nPOST $base/routes (enable advertised defaults on linuxbox only)"
$after = Invoke-RestMethod -Uri "$base/routes" -Headers $headers -Method Post -ContentType "application/json" -Body $body
$after | ConvertTo-Json -Depth 5

Write-Host "`nFrom any tailnet client, verify linuxbox appears as an exit option:"
Write-Host "  tailscale exit-node list"
& tailscale exit-node list

# Serve production static site for Cloudflare Tunnel origin (Windows PC).
# Usage: .\serve_abhinavall_tunnel.ps1 [-Port 80]
param(
  [int]$Port = 80
)

$Site = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "sites\abhinavall.net"
if (-not (Test-Path (Join-Path $Site "index.html"))) {
  Write-Error "Missing index.html at $Site"
  exit 1
}

Write-Host "Serving $Site on http://127.0.0.1:$Port/"
Write-Host "Point Cloudflare Tunnel public hostname to http://localhost:$Port"
Set-Location $Site
python -m http.server $Port --bind 127.0.0.1

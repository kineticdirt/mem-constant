<#
.SYNOPSIS
  Open Apollo local HTTPS admin UI in the default browser.
#>
$ErrorActionPreference = 'Stop'
$uri = 'https://127.0.0.1:47990'
Write-Host "[remote-stream] Opening $uri (accept certificate warning if prompted)."
Start-Process $uri

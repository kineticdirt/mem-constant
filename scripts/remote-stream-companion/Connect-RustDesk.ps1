<#
.SYNOPSIS
  Launch RustDesk from config.psd1 (backup remote path).
#>
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\RemoteStreamCommon.ps1"

$config = Read-RemoteStreamConfig
if (-not $config) { exit 1 }

$exe = $config.RustDeskPath
if ([string]::IsNullOrWhiteSpace($exe) -or -not (Test-Path -LiteralPath $exe)) {
    Write-Error "RustDeskPath not found: $exe. Install RustDesk or fix config.psd1."
    exit 1
}
Write-Host "[remote-stream] Starting RustDesk."
Start-Process -FilePath $exe

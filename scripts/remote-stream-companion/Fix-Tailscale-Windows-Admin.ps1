#Requires -RunAsAdministrator
#Requires -Version 5.1
<#
.SYNOPSIS
  Repair Windows Tailscale stuck in "Logged out" loop (run once as Administrator).

  Root causes this fixes:
  - Hung `tailscale login` CLI processes invalidating browser auth
  - Corrupted prefs (status=logged out but debug prefs LoggedOut=false)
  - Exit-node / RouteAll misconfig

  After this script: complete login ONLY in the Tailscale tray window (not CLI).
#>
$ErrorActionPreference = 'Stop'

$ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$ipn = Join-Path $env:ProgramFiles 'Tailscale\tailscale-ipn.exe'

Write-Host '=== Tailscale Windows repair (Admin) ===' -ForegroundColor Cyan

Get-CimInstance Win32_Process -Filter "Name='tailscale.exe'" | ForEach-Object {
    if ($_.CommandLine -match 'login') {
        Write-Host "Killing hung login PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Write-Host 'Restarting Tailscale service...'
Restart-Service Tailscale -Force
Start-Sleep -Seconds 3

Write-Host 'Clearing auth + exit-node routing...'
& $ts logout 2>$null
& $ts set --exit-node= --accept-routes=true --accept-dns=true 2>$null

$pd = Join-Path $env:ProgramData 'Tailscale'
if (Test-Path -LiteralPath $pd) {
    Write-Host "Ensuring SYSTEM can write $pd ..."
    icacls $pd /grant 'NT AUTHORITY\SYSTEM:(OI)(CI)F' /T /Q 2>$null | Out-Null
    icacls $pd /grant 'BUILTIN\Administrators:(OI)(CI)F' /T /Q 2>$null | Out-Null
}

Write-Host ''
Write-Host 'Opening Tailscale app - sign in ONCE with abhinavall0123@gmail.com in the GUI.' -ForegroundColor Yellow
Write-Host 'Do NOT run: tailscale login  (from Cursor/terminals - it causes instant logout loops)' -ForegroundColor Yellow
Start-Process -FilePath $ipn

Start-Sleep -Seconds 8
Write-Host ''
Write-Host '--- status ---'
& $ts status
Write-Host ''
Write-Host 'If still Logged out: uninstall Tailscale, reboot, reinstall from tailscale.com/download/windows, GUI login only.'

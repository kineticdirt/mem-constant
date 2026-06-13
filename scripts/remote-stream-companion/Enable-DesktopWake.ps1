#Requires -Version 5.1
<#
.SYNOPSIS
  One-time (re-run after driver updates): allow Wi-Fi / Ethernet to wake this PC from sleep.

.DESCRIPTION
  Wake-on-LAN from linuxbox only works if Windows and the NIC are configured to accept
  magic packets while asleep. Run this on the DESKTOP that hosts Apollo.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\Enable-DesktopWake.ps1
#>
$ErrorActionPreference = 'Continue'

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal $id
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host "`n=== Desktop Wake-on-LAN setup ===`n" -ForegroundColor Cyan

$adapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -or $_.MediaType -match '802.3|Native 802.11' }
if (-not $adapters) {
    Write-Warning 'No physical adapters found.'
}

Write-Host 'Physical adapters:'
$adapters | Format-Table Name, MacAddress, Status, MediaType -AutoSize

$wifi = $adapters | Where-Object { $_.Name -match 'Wi-Fi|Wireless' } | Select-Object -First 1
$eth = $adapters | Where-Object { $_.MediaType -eq '802.3' } | Select-Object -First 1

Write-Host 'Currently armed for wake (powercfg -devicequery wake_armed):'
powercfg -devicequery wake_armed

$programmable = @(powercfg -devicequery wake_programmable)
$devNames = @($programmable | Where-Object {
    $_ -match 'WiFi|Wi-Fi|Wireless|802\.11|Ethernet|GbE' -and $_ -notmatch 'Bluetooth'
})
if (-not $devNames -and $wifi) {
    $macFrag = ($wifi.MacAddress -replace '-', '').Substring(0, 6)
    Write-Host "Could not auto-match powercfg device for $($wifi.Name) (MAC $($wifi.MacAddress))."
}

if (-not $devNames) {
    Write-Warning 'No programmable wake devices matched active adapters. Check Device Manager manually.'
} elseif (Test-IsAdmin) {
    foreach ($dev in $devNames) {
        Write-Host "Enabling wake: $dev"
        powercfg -deviceenablewake $dev 2>&1
    }
} else {
    Write-Host "`nRe-run as Administrator to auto-enable wake on:" -ForegroundColor Yellow
    $devNames | ForEach-Object { Write-Host "  powercfg -deviceenablewake `"$_`"" }
}

Write-Host "`nRecommended (manual or admin PowerShell):"
Write-Host '  1. Device Manager -> your Wi-Fi/Ethernet -> Power Management'
Write-Host '       [x] Allow this device to wake the computer'
Write-Host '       [x] Only allow a magic packet to wake the computer (if shown)'
Write-Host '  2. BIOS: Wake on LAN / Wake on WLAN enabled; ErP/Eco off if WoL fails'
Write-Host '  3. Use Sleep (S3), not Shutdown, when leaving the PC for remote access'
Write-Host '  4. Wi-Fi WoL is less reliable than Ethernet - test before you travel'

$fast = (powercfg /a 2>&1 | Out-String)
if ($fast -match 'Fast Startup') {
    Write-Host "`nFast Startup may interfere with WoL on some boards." -ForegroundColor Yellow
    Write-Host '  Optional: Control Panel -> Power -> Choose what power buttons do -> uncheck Fast startup'
}

Write-Host "`nTest from laptop (Tailscale on, desktop asleep):"
Write-Host '  powershell -File E:\RemotePC-Setup\scripts\Run-From-Laptop.ps1'
Write-Host '  or: Connect-RemotePC.ps1 -PeerName Desktop'
Write-Host "`n=== Done ===`n" -ForegroundColor Cyan

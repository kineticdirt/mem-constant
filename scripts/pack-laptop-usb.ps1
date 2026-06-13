#Requires -Version 5.1
# Pack authoritative laptop USB to E: from desktop. Overwrites laptop-authored kit.
param(
    [string]$Drive = 'E:\'
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Kit = Join-Path $PSScriptRoot 'laptop-usb-kit'
$RemoteScripts = Join-Path $Repo 'scripts\remote-stream-companion'
$PixiKit = Join-Path $Repo 'scripts\pixi-tailnet-interconnect'
$E = $Drive.TrimEnd('\') + '\'

if (-not (Test-Path $E)) { throw "Drive not found: $E" }

$Scripts = Join-Path $E 'scripts'
$Secrets = Join-Path $E 'secrets'
New-Item -ItemType Directory -Force -Path $Scripts | Out-Null
New-Item -ItemType Directory -Force -Path $Secrets | Out-Null

# Root docs from kit
$rootFiles = @(
    'START-HERE.txt',
    'LAPTOP-DO-THIS-NOW.txt',
    'LAPTOP-INSTRUCTIONS.txt',
    'FOR-CURSOR-ON-LAPTOP.txt',
    'README FIRST.txt',
    'FROM-SCRATCH-LAPTOP.md',
    'CONNECTION-SUMMARY.txt',
    'TEST-NOW-BEFORE-TRAVEL.txt',
    'DESKTOP-PREP-DONE.txt',
    'POWERSHELL-SCRIPTS.txt',
    'APOLLO-LOGIN.txt',
    'TRANSFER-TO-LAPTOP.txt',
    'SETUP-EVERYTHING-Admin.cmd'
)
foreach ($f in $rootFiles) {
    Copy-Item -Force (Join-Path $Kit $f) (Join-Path $E $f)
    Write-Host "root: $f"
}

# Root START-HERE comes from kit (points to LAPTOP-INSTRUCTIONS.txt)

# Scripts from repo
$copyScripts = @(
    'Connect-RemotePC.ps1',
    'RemoteStreamCommon.ps1',
    'Enable-DesktopWake.ps1',
    'Test-RemoteTailnet.ps1',
    'Setup-Everything.ps1',
    'Connect-RustDesk.ps1',
    'Open-ApolloWebUI.ps1',
    'config.psd1'
)
foreach ($f in $copyScripts) {
    Copy-Item -Force (Join-Path $RemoteScripts $f) (Join-Path $Scripts $f)
    Write-Host "scripts: $f"
}
Copy-Item -Force (Join-Path $Scripts 'config.psd1') (Join-Path $Scripts 'config.laptop.psd1')

@'
Host potato linuxbox
    HostName 100.122.108.94
    User abhinav
    IdentityFile ~/.ssh/id_rsa_potato
    IdentitiesOnly yes
'@ | Set-Content -Path (Join-Path $Scripts 'ssh-config-snippet.txt') -Encoding UTF8

@'
param([switch]$DryRun,[switch]$OpenApollo)
$ErrorActionPreference = ''Stop''
$root = $PSScriptRoot
Write-Host ''[remote-stream] Laptop -> Desktop (USB)''
if ($DryRun) { exit 0 }
if ($OpenApollo) { & (Join-Path $root ''Open-ApolloWebUI.ps1'') }
& (Join-Path $root ''Connect-RemotePC.ps1'')
'@ | Set-Content -Path (Join-Path $Scripts 'Run-From-Laptop.ps1') -Encoding UTF8

# Verify-Tailnet - copy from old kit path or generate minimal
$verifySrc = Join-Path $E 'LaptopCursor-Setup\scripts\Verify-Tailnet.ps1'
if (Test-Path $verifySrc) {
    Copy-Item -Force $verifySrc (Join-Path $Scripts 'Verify-Tailnet.ps1')
} else {
    Copy-Item -Force (Join-Path $RemoteScripts 'Test-RemoteTailnet.ps1') (Join-Path $Scripts 'Verify-Tailnet.ps1')
}
Write-Host 'scripts: Verify-Tailnet.ps1'

foreach ($cmdName in @('Verify-Tailnet.cmd', 'Run-From-Laptop.cmd', 'Test-RemoteTailnet.cmd')) {
    Copy-Item -Force (Join-Path $Kit $cmdName) (Join-Path $Scripts $cmdName)
    Write-Host "scripts: $cmdName"
}

# Tailscale repair (Admin) — desktop only
$fixTs = Join-Path $RemoteScripts 'Fix-Tailscale-Windows-Admin.ps1'
if (Test-Path -LiteralPath $fixTs) {
    Copy-Item -Force $fixTs (Join-Path $Scripts 'Fix-Tailscale-Windows-Admin.ps1')
    @(
        '@echo off'
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Fix-Tailscale-Windows-Admin.ps1" %*'
        'exit /b %ERRORLEVEL%'
    ) | Set-Content -Path (Join-Path $Scripts 'Fix-Tailscale-Windows-Admin.cmd') -Encoding ASCII
    Write-Host 'scripts: Fix-Tailscale-Windows-Admin.ps1 + .cmd'
}

# Pixi RP tailnet kit -> E:\ObsidianWriterStack\scripts\
if (Test-Path -LiteralPath $PixiKit) {
    & (Join-Path $PixiKit 'Deploy-To-E-Drive.ps1') -Source $PixiKit -Dest (Join-Path $E 'ObsidianWriterStack')
    Write-Host 'pixi: ObsidianWriterStack\scripts\ (Open-PixiRP, Enable-PixiTailnetServe, ...)'
}

# Desktop repack helper on USB (when drive is plugged back into desktop)
Copy-Item -Force (Join-Path $Kit 'REPACK-USB-FROM-DESKTOP.cmd') (Join-Path $E 'REPACK-USB-FROM-DESKTOP.cmd')
Write-Host 'root: REPACK-USB-FROM-DESKTOP.cmd'

# SSH key for laptop
$keySrc = Join-Path $env:USERPROFILE '.ssh\id_rsa_potato'
if (-not (Test-Path $keySrc)) { throw "Missing desktop key: $keySrc" }
Copy-Item -Force $keySrc (Join-Path $Secrets 'id_rsa_potato')
@'
Copy to laptop:
  copy E:\secrets\id_rsa_potato %USERPROFILE%\.ssh\
Git Bash: chmod 600 ~/.ssh/id_rsa_potato
Apollo login: see apollo-credentials.txt in this folder.
Delete this secrets folder from USB after copy if you want.
'@ | Set-Content -Path (Join-Path $Secrets 'README.txt') -Encoding UTF8

$apolloLocal = Join-Path $Kit 'secrets-local\apollo-credentials.txt'
if (Test-Path -LiteralPath $apolloLocal) {
    Copy-Item -Force $apolloLocal (Join-Path $Secrets 'apollo-credentials.txt')
    Write-Host 'secrets: id_rsa_potato + apollo-credentials.txt'
} else {
    Write-Host 'secrets: id_rsa_potato (no apollo-credentials.txt - add secrets-local\apollo-credentials.txt)'
}

# Mark old subfolders superseded
foreach ($old in @('LaptopCursor-Setup', 'RemotePC-Setup')) {
    $p = Join-Path $E $old
    if (Test-Path $p) {
        'SUPERSEDED — use drive root README FIRST.txt and E:\scripts\' |
            Set-Content -Path (Join-Path $p 'START-HERE.txt') -Encoding UTF8
        Write-Host "marked superseded: $old"
    }
}

Write-Host ""
Write-Host "Done. Give USB to laptop. Open E:\LAPTOP-DO-THIS-NOW.txt on laptop."

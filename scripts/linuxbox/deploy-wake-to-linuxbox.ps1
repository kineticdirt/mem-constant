#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy wake-desktop.sh and ensure-tailscale-up.sh to linuxbox ~/bin (LF-normalized).
#>
param(
    [string]$SshHost = '100.122.108.94',
    [string]$SshUser = 'abhinav',
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa_potato"
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$sshArgs = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15')
if (Test-Path $SshKey) { $sshArgs += @('-i', $SshKey, '-o', 'IdentitiesOnly=yes') }
$target = "${SshUser}@${SshHost}"

foreach ($name in @('wake-desktop.sh', 'ensure-tailscale-up.sh')) {
    $local = Join-Path $root $name
    if (-not (Test-Path $local)) { throw "Missing $local" }
    $temp = Join-Path $env:TEMP $name
    $text = [IO.File]::ReadAllText($local) -replace "`r`n", "`n"
    [IO.File]::WriteAllText($temp, $text)
    & scp @sshArgs $temp "${target}:~/bin/$name"
    Write-Host "deployed ~/bin/$name"
}

& ssh @sshArgs $target "chmod +x ~/bin/wake-desktop.sh ~/bin/ensure-tailscale-up.sh && bash ~/bin/wake-desktop.sh 58:10:31:EA:9A:2D 192.168.7.255 | head -2"
Write-Host 'linuxbox wake scripts OK'

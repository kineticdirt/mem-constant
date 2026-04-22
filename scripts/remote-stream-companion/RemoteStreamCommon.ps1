# Dot-source from Connect-RemotePC.ps1 / Connect-RustDesk.ps1 (same directory as config.psd1).

function Get-RemoteStreamScriptRoot {
    return $PSScriptRoot
}

function Read-RemoteStreamConfig {
    $root = Get-RemoteStreamScriptRoot
    $path = Join-Path $root 'config.psd1'
    if (-not (Test-Path -LiteralPath $path)) {
        $example = Join-Path $root 'config.example.psd1'
        Write-Error "Missing config.psd1 in $root. Copy config.example.psd1 to config.psd1 and edit Peers / DefaultPeer / WakeMac. Example: Copy-Item -LiteralPath '$example' -Destination '$path'"
        return $null
    }
    return Import-PowerShellDataFile -LiteralPath $path
}

function Test-IsPlaceholderMac {
    param([string]$Mac)
    if ([string]::IsNullOrWhiteSpace($Mac)) { return $true }
    $hex = ($Mac -replace '[:-]', '')
    if ($hex.Length -ne 12) { return $false }
    return ($hex -match '^0+$')
}

function Send-WakeOnLan {
    param(
        [Parameter(Mandatory)][string]$MacAddress
    )
    if (Test-IsPlaceholderMac -Mac $MacAddress) {
        Write-Host '[remote-stream] Skipping Wake-on-LAN (placeholder or empty WakeMac).'
        return $false
    }
    $parts = $MacAddress -split '[:-]' | Where-Object { $_ }
    if ($parts.Count -ne 6) {
        Write-Warning "WakeMac must be 6 octets (e.g. AA-BB-CC-DD-EE-FF); got: $MacAddress"
        return $false
    }
    try {
        $macBytes = foreach ($p in $parts) { [Convert]::ToByte($p, 16) }
    } catch {
        Write-Warning "Invalid WakeMac: $MacAddress"
        return $false
    }
    $packet = New-Object byte[] (6 + 16 * 6)
    for ($i = 0; $i -lt 6; $i++) { $packet[$i] = 0xFF }
    for ($i = 0; $i -lt 16; $i++) {
        [Array]::Copy($macBytes, 0, $packet, 6 + ($i * 6), 6)
    }
    try {
        $udp = New-Object System.Net.Sockets.UdpClient
        $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::Broadcast, $true)
        $ep = New-Object System.Net.IPEndPoint ([System.Net.IPAddress]::Broadcast, 9)
        [void]$udp.Send($packet, $packet.Length, $ep)
        $udp.Close()
        Write-Host "[remote-stream] Sent Wake-on-LAN for $MacAddress"
        return $true
    } catch {
        Write-Warning "Wake-on-LAN send failed: $_"
        return $false
    }
}

function Wait-RemoteStreamPort {
    param(
        [Parameter(Mandatory)][string]$HostName,
        [Parameter(Mandatory)][int]$Port,
        [int]$MaxRetries = 8,
        [int]$RetryIntervalSeconds = 10,
        [int]$ConnectTimeoutMs = 5000
    )
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        $client = $null
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect($HostName, $Port, $null, $null)
            if (-not $iar.AsyncWaitHandle.WaitOne($ConnectTimeoutMs)) {
                throw 'timeout'
            }
            $client.EndConnect($iar)
            Write-Host "[remote-stream] $HostName`:$Port is reachable (attempt $attempt / $MaxRetries)."
            return $true
        } catch {
            Write-Host "[remote-stream] $HostName`:$Port not ready yet (attempt $attempt / $MaxRetries). Waiting ${RetryIntervalSeconds}s..."
            Start-Sleep -Seconds $RetryIntervalSeconds
        } finally {
            if ($client) {
                try { $client.Close() } catch { }
            }
        }
    }
    Write-Warning "[remote-stream] $HostName`:$Port did not open within retries. Launching Moonlight anyway - host may still be booting or Apollo may be stopped."
    return $false
}

# Copy this file to config.psd1 in the same folder and edit per machine.
# Two-way: each PC runs Apollo (host) + Moonlight (client). Peers = the other machines.

@{
  DefaultPeer = "Desktop"

  StreamCheckPort = 47984
  WakeWaitSeconds = 45
  MaxRetries = 8
  RetryIntervalSeconds = 10

  # Remote wake while away: linuxbox (always on) broadcasts WoL on home LAN.
  # Broadcast = /22 for 192.168.4.0/22 (mask 255.255.252.0). Adjust if your LAN differs.
  WakeRelay = @{
    Enabled   = $true
    SshHost   = "100.122.108.94"
    SshUser   = "abhinav"
  # SshKey    — omit in .psd1 ($env not allowed); ssh uses ~/.ssh/config or default keys
    Broadcast = "192.168.7.255"
  # Script    = "/home/abhinav/agent-dump/scripts/linuxbox/wake-desktop.sh"
  }

  MoonlightPath = "C:\Program Files\Moonlight Game Streaming\Moonlight.exe"
  RustDeskPath = "C:\Program Files\RustDesk\rustdesk.exe"

  Peers = @{
    Desktop = @{
      StreamHost = "100.118.226.87"
      WakeMac    = "00-00-00-00-00-00"
    }
    Laptop = @{
      StreamHost = "100.77.115.62"
      WakeMac    = "FE-04-16-32-A7-DF"
    }
  }
}

# Copy this file to config.psd1 in the same folder and edit per machine.
# Two-way: each PC runs Apollo (host) + Moonlight (client). Peers = the other machines.

@{
  DefaultPeer = "Desktop"

  StreamCheckPort = 47984
  WakeWaitSeconds = 45
  MaxRetries = 8
  RetryIntervalSeconds = 10

  MoonlightPath = "C:\Program Files\Moonlight Game Streaming\Moonlight.exe"
  RustDeskPath = "C:\Program Files\RustDesk\rustdesk.exe"

  Peers = @{
    Desktop = @{
      StreamHost = "100.96.132.49"
      WakeMac    = "00-00-00-00-00-00"
    }
    Laptop = @{
      StreamHost = "100.77.115.62"
      WakeMac    = "FE-04-16-32-A7-DF"
    }
  }
}

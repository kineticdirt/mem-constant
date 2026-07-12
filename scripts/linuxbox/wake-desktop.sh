#!/usr/bin/env bash
# Send Wake-on-LAN for a host on the same LAN as linuxbox.
# Usage: wake-desktop.sh <MAC> [broadcast]
# Example: wake-desktop.sh 58:10:31:EA:9A:2D 192.168.7.255
set -euo pipefail

MAC="${1:-}"
BROADCAST="${2:-}"

if [[ -z "$MAC" ]]; then
  echo "usage: $0 <MAC> [broadcast]" >&2
  exit 1
fi

if [[ -z "$BROADCAST" ]]; then
  # Derive /22 broadcast from wlan0 if present (home LAN is often 192.168.4.0/22).
  if command -v ip >/dev/null 2>&1; then
    BROADCAST="$(ip -4 route show dev wlan0 2>/dev/null | awk '/broadcast/ {print $1; exit}')"
  fi
  BROADCAST="${BROADCAST:-192.168.7.255}"
fi

norm="${MAC//:/}"
norm="${norm//-/}"
norm="${norm,,}"
if [[ ${#norm} -ne 12 ]]; then
  echo "invalid MAC: $MAC" >&2
  exit 1
fi

send_python() {
  python3 - "$norm" "$BROADCAST" <<'PY'
import socket, sys
mac_hex, broadcast = sys.argv[1], sys.argv[2]
mac = bytes.fromhex(mac_hex)
packet = b"\xff" * 6 + mac * 16
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
for target in (broadcast, "255.255.255.255"):
    try:
        sock.sendto(packet, (target, 9))
        print(f"sent WoL to {target}:9 for {mac_hex}")
    except OSError as exc:
        print(f"warn: {target}: {exc}", file=sys.stderr)
sock.close()
PY
}

if command -v python3 >/dev/null 2>&1; then
  send_python
  exit 0
fi

echo "python3 required for WoL on this host" >&2
exit 1

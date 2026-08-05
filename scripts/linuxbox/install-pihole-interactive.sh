#!/usr/bin/env bash
# Official one-step Pi-hole installer (interactive wizard).
# Run on linuxbox: curl is piped to bash — review https://github.com/pi-hole/pi-hole first if you prefer.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/preflight-pihole-dns.sh" ]; then
  bash "$SCRIPT_DIR/preflight-pihole-dns.sh"
  echo ""
fi

echo "Starting Pi-hole installer (interactive). Choose interface (often eth0), static IP, upstream DNS (e.g. Cloudflare), and admin password."
curl -sSL https://install.pi-hole.net | bash

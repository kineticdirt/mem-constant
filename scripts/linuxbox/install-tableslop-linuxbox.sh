#!/usr/bin/env bash
# Install tableslop map viewer systemd unit on linuxbox.
# Usage: sudo bash install-tableslop-linuxbox.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo on linuxbox." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SRC="${SCRIPT_DIR}/linuxbox-tableslop.service"
UNIT_DST="/etc/systemd/system/linuxbox-tableslop.service"

cp "${UNIT_SRC}" "${UNIT_DST}"
systemctl daemon-reload
systemctl enable linuxbox-tableslop
systemctl restart linuxbox-tableslop
sleep 1
systemctl is-active linuxbox-tableslop
curl -sf "http://127.0.0.1:8765/health" || { echo "health check failed" >&2; exit 1; }
echo "OK — tableslop on http://127.0.0.1:8765/"
echo ""
echo "Discord login: docs/tableslop-discord-auth.md"
echo "  bash scripts/linuxbox/configure-tableslop-discord-auth.sh"
echo ""
echo "Cloudflare (tableslop.org): Zero Trust → Tunnels → linuxbox connector → Public Hostname"
echo "  Service: HTTP → http://127.0.0.1:8765"
echo "  Example: vtt.tableslop.org or ally.tableslop.org"
echo "If tableslop still points at Windows DESKTOP-IQQESD4, repoint or add a route on the linuxbox tunnel."

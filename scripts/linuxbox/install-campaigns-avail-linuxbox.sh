#!/usr/bin/env bash
# Install campaigns.tableslop.org availability origin on linuxbox (:8768).
# Usage: sudo bash install-campaigns-avail-linuxbox.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo on linuxbox." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SRC="${SCRIPT_DIR}/linuxbox-campaigns-avail.service"
UNIT_DST="/etc/systemd/system/linuxbox-campaigns-avail.service"

cp "${UNIT_SRC}" "${UNIT_DST}"
systemctl daemon-reload
systemctl enable linuxbox-campaigns-avail
systemctl restart linuxbox-campaigns-avail
sleep 1
systemctl is-active linuxbox-campaigns-avail
curl -sf "http://127.0.0.1:8768/health" || { echo "health check failed" >&2; exit 1; }
echo "OK — campaigns availability on http://127.0.0.1:8768/"
echo "CF (human if API lacks DNS/tunnel write):"
echo "  Tunnel WOD_HTR_LinBox_TABLESLOP → Public Hostname campaigns.tableslop.org → http://127.0.0.1:8768"
echo "  DNS CNAME campaigns → <tunnel-uuid>.cfargotunnel.com (proxied)"
echo "  Keep map.tableslop.org → http://127.0.0.1:8765 unchanged"

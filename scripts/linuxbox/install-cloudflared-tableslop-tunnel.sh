#!/usr/bin/env bash
# Install tableslop-only cloudflared connector (WOD_HTR_LinBox_TABLESLOP).
# Does NOT touch abhinavall.net tunnel or run global cloudflared service uninstall.
#
# Usage (on linuxbox):
#   sudo bash scripts/linuxbox/install-cloudflared-tableslop-tunnel.sh '<TABLESLOP_TUNNEL_TOKEN>'
#
# CF dashboard (human): map.tableslop.org → http://127.0.0.1:8765
set -euo pipefail

REPO="${REPO:-/home/abhinav/agent-dump}"
# shellcheck source=lib/cloudflared-named-tunnel.sh
source "${REPO}/scripts/linuxbox/lib/cloudflared-named-tunnel.sh"

TOKEN="${1:-}"
ENV_FILE="/home/abhinav/.cloudflare/tableslop-tunnel.env"
UNIT_SRC="${REPO}/scripts/linuxbox/cloudflared-tableslop.service"

if [[ -z "${TOKEN}" ]]; then
  echo "usage: sudo bash install-cloudflared-tableslop-tunnel.sh '<TABLESLOP_TUNNEL_TOKEN>'" >&2
  echo "Tunnel: Zero Trust → WOD_HTR_LinBox_TABLESLOP → Install connector" >&2
  exit 1
fi

cloudflared_install_named_tunnel "cloudflared-tableslop" "${ENV_FILE}" "${TOKEN}" "${UNIT_SRC}"

echo "OK — cloudflared-tableslop active (RP frontend only)."
echo "Verify: curl -sI https://map.tableslop.org/health"
echo "Origin: systemctl is-active linuxbox-tableslop && curl -s http://127.0.0.1:8765/health"

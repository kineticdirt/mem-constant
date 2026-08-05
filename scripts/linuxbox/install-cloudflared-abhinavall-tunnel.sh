#!/usr/bin/env bash
# Install abhinavall/linuxbox backend cloudflared connector (abhinavall.net tunnel).
# Does NOT touch tableslop tunnel or run global cloudflared service uninstall.
#
# Usage (on linuxbox):
#   sudo bash scripts/linuxbox/install-cloudflared-abhinavall-tunnel.sh '<ABHINAVALL_TUNNEL_TOKEN>'
#
# CF dashboard (human): abhinavall.net → http://127.0.0.1:8780
set -euo pipefail

REPO="${REPO:-/home/abhinav/agent-dump}"
# shellcheck source=lib/cloudflared-named-tunnel.sh
source "${REPO}/scripts/linuxbox/lib/cloudflared-named-tunnel.sh"

TOKEN="${1:-}"
ENV_FILE="/home/abhinav/.cloudflare/abhinavall-tunnel.env"
UNIT_SRC="${REPO}/scripts/linuxbox/cloudflared-abhinavall.service"

if [[ -z "${TOKEN}" ]]; then
  echo "usage: sudo bash install-cloudflared-abhinavall-tunnel.sh '<ABHINAVALL_TUNNEL_TOKEN>'" >&2
  echo "Tunnel: Zero Trust → abhinavall.net → Install connector" >&2
  exit 1
fi

cloudflared_install_named_tunnel "cloudflared-abhinavall" "${ENV_FILE}" "${TOKEN}" "${UNIT_SRC}"

echo "OK — cloudflared-abhinavall active (site + /Linuxbox + /Intel backend)."
echo "Verify: curl -sI https://abhinavall.net/ && curl -sI https://abhinavall.net/Linuxbox/"
echo "Origin proxy: systemctl is-active abhinavall-origin-8780"

#!/usr/bin/env bash
# DEPRECATED — use split tunnel installers (no global service uninstall).
#
#   sudo bash scripts/linuxbox/install-cloudflared-abhinavall-tunnel.sh '<token>'
#   sudo bash scripts/linuxbox/install-cloudflared-tableslop-tunnel.sh '<token>'
#
# See docs/cloudflare-tunnels-linuxbox.md
set -euo pipefail

echo "DEPRECATED: install-cloudflared-tunnel.sh wipes the shared cloudflared.service" >&2
echo "and caused tableslop connector thrashing." >&2
echo "" >&2
echo "Use instead:" >&2
echo "  install-cloudflared-abhinavall-tunnel.sh  — abhinavall.net backend" >&2
echo "  install-cloudflared-tableslop-tunnel.sh   — map.tableslop.org RP frontend" >&2
echo "  migrate-cloudflared-split-tunnels.sh      — one-time cutover" >&2
echo "Doc: docs/cloudflare-tunnels-linuxbox.md" >&2
exit 1

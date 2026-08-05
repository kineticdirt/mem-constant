#!/usr/bin/env bash
# Verify tableslop tunnel routing (CF dashboard + local origin). Does NOT edit config.yml.
# map.tableslop.org belongs on WOD_HTR_LinBox_TABLESLOP token tunnel — not abhinav-portfolio config.yml.
#
# Usage: bash scripts/linuxbox/add-tableslop-cloudflared-ingress.sh
set -euo pipefail

echo "tableslop tunnel policy (split connectors):"
echo "  CF tunnel:  WOD_HTR_LinBox_TABLESLOP"
echo "  systemd:    cloudflared-tableslop.service"
echo "  hostname:   map.tableslop.org → http://127.0.0.1:8765"
echo "  origin app: linuxbox-tableslop (:8765)"
echo ""
echo "Install (once, on linuxbox):"
echo "  sudo bash scripts/linuxbox/install-cloudflared-tableslop-tunnel.sh '<TABLESLOP_TUNNEL_TOKEN>'"
echo ""
echo "Do NOT add map.tableslop.org to ~/.cloudflared/config.yml (abhinavall backend tunnel)."
echo "Do NOT run install-cloudflared-tunnel.sh (deprecated; global uninstall)."
echo ""

fail=0
if systemctl is-active --quiet linuxbox-tableslop 2>/dev/null; then
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/health 2>/dev/null || echo 000)"
  echo "linuxbox-tableslop: active, /health HTTP ${code}"
  [[ "${code}" == "200" ]] || fail=1
else
  echo "linuxbox-tableslop: NOT active"
  fail=1
fi

if systemctl is-active --quiet cloudflared-tableslop 2>/dev/null; then
  echo "cloudflared-tableslop: active"
else
  echo "cloudflared-tableslop: NOT active — run install-cloudflared-tableslop-tunnel.sh"
  fail=1
fi

if [[ -f "${HOME}/.cloudflared/config.yml" ]] && grep -q "hostname: map.tableslop.org" "${HOME}/.cloudflared/config.yml"; then
  echo "WARN: map.tableslop.org still in config.yml — remove to avoid overlap (migrate script does this)."
  fail=1
fi

exit "${fail}"

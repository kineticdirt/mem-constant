#!/usr/bin/env bash
# Verify / document campaigns.tableslop.org routing. Does NOT edit CF (token often lacks DNS/tunnel write).
# Usage: bash scripts/linuxbox/add-campaigns-tableslop-ingress.sh
set -euo pipefail

TUNNEL_UUID="${TABLESLOP_TUNNEL_UUID:-5ec67cd8-5345-46cd-a9bf-06e8daf92e57}"

echo "campaigns.tableslop.org policy:"
echo "  CF tunnel:  WOD_HTR_LinBox_TABLESLOP (${TUNNEL_UUID})"
echo "  systemd:    linuxbox-campaigns-avail.service"
echo "  hostname:   campaigns.tableslop.org → http://127.0.0.1:8768"
echo "  map stays:  map.tableslop.org → http://127.0.0.1:8765"
echo ""
echo "Human CF steps (when API token cannot write DNS/tunnel config):"
echo "  1) Zero Trust → Networks → Tunnels → WOD_HTR_LinBox_TABLESLOP → Public Hostname"
echo "     Add: campaigns.tableslop.org  Service: HTTP  URL: http://127.0.0.1:8768"
echo "     Do NOT remove or edit map.tableslop.org → http://127.0.0.1:8765"
echo "  2) DNS (tableslop.org zone): CNAME campaigns → ${TUNNEL_UUID}.cfargotunnel.com (Proxy ON)"
echo "  3) Verify: curl -s https://campaigns.tableslop.org/health"
echo ""

fail=0
if systemctl is-active --quiet linuxbox-campaigns-avail 2>/dev/null; then
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8768/health 2>/dev/null || echo 000)"
  echo "linuxbox-campaigns-avail: active, /health HTTP ${code}"
  [[ "${code}" == "200" ]] || fail=1
else
  echo "linuxbox-campaigns-avail: NOT active"
  fail=1
fi

if systemctl is-active --quiet cloudflared-tableslop 2>/dev/null; then
  echo "cloudflared-tableslop: active"
else
  echo "cloudflared-tableslop: NOT active"
  fail=1
fi

pub="$(curl -s -o /dev/null -w '%{http_code}' https://campaigns.tableslop.org/health 2>/dev/null || echo 000)"
echo "public https://campaigns.tableslop.org/health → HTTP ${pub}"
if [[ "${pub}" != "200" ]]; then
  echo "public not live yet (DNS / Public Hostname pending)"
  fail=1
fi

# map must remain up
map_code="$(curl -s -o /dev/null -w '%{http_code}' https://map.tableslop.org/health 2>/dev/null || echo 000)"
echo "map.tableslop.org/health → HTTP ${map_code} (must stay 200)"
[[ "${map_code}" == "200" ]] || fail=1

exit "${fail}"

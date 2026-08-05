#!/usr/bin/env bash
# One-time migration: retire shared cloudflared.service + config.yml tunnel;
# enable split cloudflared-tableslop + cloudflared-abhinavall units.
#
# Run ON linuxbox after both install-* scripts succeed (or pass tokens below).
#
# Usage:
#   sudo bash scripts/linuxbox/migrate-cloudflared-split-tunnels.sh
#   sudo bash scripts/linuxbox/migrate-cloudflared-split-tunnels.sh '<abhinavall_token>' '<tableslop_token>'
set -euo pipefail

REPO="${REPO:-/home/abhinav/agent-dump}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo on linuxbox." >&2
  exit 1
fi

AB_TOKEN="${1:-}"
TG_TOKEN="${2:-}"

legacy_token_from_unit() {
  local unit="/etc/systemd/system/cloudflared.service"
  if [[ ! -f "${unit}" ]]; then
    return 1
  fi
  grep -oE 'tunnel run --token [^ ]+' "${unit}" 2>/dev/null | awk '{print $NF}' || true
}

if [[ -z "${AB_TOKEN}" ]]; then
  AB_TOKEN="$(legacy_token_from_unit || true)"
fi

echo "=== Disable legacy shared connectors (no global uninstall) ==="
systemctl disable --now cloudflared.service 2>/dev/null || true
systemctl disable --now cloudflared-tunnel.service 2>/dev/null || true
systemctl disable --now cloudflared-rebased-tunnel.service 2>/dev/null || true

CFG="/home/abhinav/.cloudflared/config.yml"
if [[ -f "${CFG}" ]] && grep -q "hostname: map.tableslop.org" "${CFG}"; then
  cp "${CFG}" "${CFG}.bak-split-$(date +%Y%m%d%H%M)"
  python3 - "${CFG}" <<'PY'
import sys
from pathlib import Path

cfg = Path(sys.argv[1])
lines = cfg.read_text(encoding="utf-8").splitlines()
out = []
skip = 0
for line in lines:
    if "hostname: map.tableslop.org" in line:
        skip = 4
        continue
    if skip > 0:
        skip -= 1
        continue
    out.append(line)
cfg.write_text("\n".join(out) + "\n", encoding="utf-8")
print("Removed map.tableslop.org from config.yml (tableslop uses WOD_HTR token tunnel now).")
PY
fi

if [[ -n "${AB_TOKEN}" ]]; then
  bash "${REPO}/scripts/linuxbox/install-cloudflared-abhinavall-tunnel.sh" "${AB_TOKEN}"
else
  echo "SKIP abhinavall install — no token (pass arg1 or keep existing cloudflared-abhinavall.service)."
fi

if [[ -n "${TG_TOKEN}" ]]; then
  bash "${REPO}/scripts/linuxbox/install-cloudflared-tableslop-tunnel.sh" "${TG_TOKEN}"
else
  echo "SKIP tableslop install — pass TABLESLOP token as arg2."
fi

echo ""
echo "=== Status ==="
systemctl is-active cloudflared-abhinavall.service 2>/dev/null || echo "cloudflared-abhinavall: inactive"
systemctl is-active cloudflared-tableslop.service 2>/dev/null || echo "cloudflared-tableslop: inactive"
systemctl is-active cloudflared.service 2>/dev/null || echo "cloudflared (legacy): inactive (expected)"
systemctl is-active cloudflared-tunnel.service 2>/dev/null || echo "cloudflared-tunnel (legacy): inactive (expected)"

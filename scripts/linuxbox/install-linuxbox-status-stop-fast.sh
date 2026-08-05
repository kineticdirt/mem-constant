#!/usr/bin/env bash
# Idempotent: ensure linuxbox-status stop-fast drop-in (KillMode=control-group,
# TimeoutStopSec=10, SendSIGKILL=yes). daemon-reload only when needed; never restarts.
# Usage (on potato): bash scripts/linuxbox/install-linuxbox-status-stop-fast.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="${SCRIPT_DIR}/linuxbox-status.service.d/stop-fast.conf"
DEST_DIR="/etc/systemd/system/linuxbox-status.service.d"
DEST="${DEST_DIR}/stop-fast.conf"
UNIT="linuxbox-status.service"

if [[ ! -f "${SRC}" ]]; then
  echo "missing drop-in source: ${SRC}" >&2
  exit 1
fi

need_reload=0

if [[ ! -d "${DEST_DIR}" ]]; then
  sudo mkdir -p "${DEST_DIR}"
  need_reload=1
fi

if [[ ! -f "${DEST}" ]] || ! cmp -s "${SRC}" "${DEST}"; then
  sudo cp "${SRC}" "${DEST}"
  need_reload=1
  echo "installed ${DEST}"
else
  echo "drop-in already current: ${DEST}"
fi

# Effective runtime values (may already match via main unit; drop-in still durable)
kill_mode="$(systemctl show "${UNIT}" -p KillMode --value 2>/dev/null || true)"
timeout_us="$(systemctl show "${UNIT}" -p TimeoutStopUSec --value 2>/dev/null || true)"
send_kill="$(systemctl show "${UNIT}" -p SendSIGKILL --value 2>/dev/null || true)"

# TimeoutStopUSec prints like "10s" or "1min 30s"
case "${timeout_us}" in
  10s|10000000) timeout_ok=1 ;;
  *) timeout_ok=0 ;;
esac

if [[ "${kill_mode}" != "control-group" || "${timeout_ok}" -ne 1 || "${send_kill}" != "yes" ]]; then
  need_reload=1
fi

if [[ "${need_reload}" -eq 1 ]]; then
  sudo systemctl daemon-reload
  echo "daemon-reload done"
else
  echo "daemon-reload skipped (already equivalent)"
fi

echo "--- effective ---"
systemctl show "${UNIT}" -p KillMode -p TimeoutStopUSec -p SendSIGKILL -p DropInPaths
echo "OK: ${UNIT} stop-fast (no restart)"

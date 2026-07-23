#!/usr/bin/env bash
# Restart hermes-gateway when systemd says active but the event loop is hung.
# Evidence (2026-07-11): MainPID stuck in D (disk sleep) on ~/.hermes/state.db (~1.9G);
# Discord "heartbeat blocked" while systemctl is-active still reports active.
# Restart=always does not help hung-but-alive processes.
set -euo pipefail

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
UNIT="${HERMES_GATEWAY_UNIT:-hermes-gateway}"
LOG_DIR="${HERMES_WATCHDOG_LOG:-/mnt/archive/logs}"
LOG="${LOG_DIR}/hermes-gateway-watchdog.log"
STATE_DB="${HOME}/.hermes/state.db"
ALERT_JSON="${HOME}/agent-dump/agents/state/hermes-gateway-watchdog.json"

mkdir -p "$(dirname "${ALERT_JSON}")" 2>/dev/null || true
if [[ -d "${LOG_DIR}" ]]; then
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
fi

log() {
  local line="[$(date -u -Iseconds)] $*"
  echo "${line}"
  if [[ -d "${LOG_DIR}" ]]; then
    echo "${line}" >> "${LOG}" 2>/dev/null || true
  fi
}

write_alert() {
  local status="$1"
  local reason="$2"
  printf '{"status":"%s","reason":"%s","at":"%s"}\n' \
    "${status}" "${reason}" "$(date -u -Iseconds)" > "${ALERT_JSON}.tmp"
  mv -f "${ALERT_JSON}.tmp" "${ALERT_JSON}"
}

if ! systemctl --user is-active --quiet "${UNIT}"; then
  log "inactive — restarting ${UNIT}"
  write_alert "restarting" "inactive"
  systemctl --user restart "${UNIT}"
  exit 0
fi

PID="$(systemctl --user show -p MainPID --value "${UNIT}" 2>/dev/null || echo 0)"
STATE="?"
if [[ -n "${PID}" && "${PID}" != "0" && -d "/proc/${PID}" ]]; then
  STATE="$(ps -o state= -p "${PID}" 2>/dev/null | tr -d '[:space:]' || echo '?')"
fi

BLOCKS="$(journalctl --user -u "${UNIT}" --since "3 min ago" --no-pager 2>/dev/null \
  | grep -c 'heartbeat blocked' || true)"

DB_BYTES=0
if [[ -f "${STATE_DB}" ]]; then
  DB_BYTES="$(stat -c%s "${STATE_DB}" 2>/dev/null || echo 0)"
fi
# ~800MB warn threshold — hung box had 1.9G
DB_WARN_BYTES=$((800 * 1024 * 1024))

REASON=""
if [[ "${STATE}" == D* ]]; then
  REASON="mainpid_disk_sleep state=${STATE} pid=${PID}"
elif [[ "${BLOCKS:-0}" -ge 3 ]]; then
  REASON="discord_heartbeat_blocked count=${BLOCKS}"
fi

if [[ -n "${REASON}" ]]; then
  log "HUNG — restarting ${UNIT} (${REASON}; state.db=${DB_BYTES}B)"
  write_alert "restarting" "${REASON}"
  systemctl --user restart "${UNIT}"
  sleep 3
  if systemctl --user is-active --quiet "${UNIT}"; then
    write_alert "recovered" "${REASON}"
    log "recovered — ${UNIT} active"
  else
    write_alert "failed" "${REASON}"
    log "FAIL — ${UNIT} still not active after restart"
  fi
  exit 0
fi

# Also guard profile DBs (fast/think/…) — gateway DB alone is not enough
GUARD="${HOME}/agent-dump/scripts/linuxbox/hermes-profile-db-guard.sh"
if [[ -f "${GUARD}" ]]; then
  bash "${GUARD}" >>"${LOG}" 2>&1 || true
fi

if [[ "${DB_BYTES}" -gt "${DB_WARN_BYTES}" ]]; then
  write_alert "ok_warn_db" "state.db_bytes=${DB_BYTES}"
else
  write_alert "ok" "state=${STATE} blocks=${BLOCKS:-0}"
fi
exit 0

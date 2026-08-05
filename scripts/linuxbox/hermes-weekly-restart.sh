#!/usr/bin/env bash
# hermes-weekly-restart.sh — Sunday ~04:30 crontab. Restart the OPS hermes-gateway
# user unit as hygiene (accumulated session bloat precedes the D-state hang; the
# watchdog covers hard hangs, this prevents them). Verifies is-active after restart
# and exits nonzero if not active. Does NOT touch hermes-gateway-hunter-reckoning
# (separate unit, D-state flappy — hands off per ops rule).
# Log: /tmp/hermes-weekly-restart.log (kept <=200 lines).
set -uo pipefail
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
LOG="${HERMES_RESTART_LOG:-/tmp/hermes-weekly-restart.log}"

log() { echo "$(date -Iseconds) $*" >>"${LOG}"; }

if ! systemctl --user restart hermes-gateway.service; then
  log "RESTART failed rc=$?"
  exit 1
fi
sleep 3
active="$(systemctl --user is-active hermes-gateway.service 2>/dev/null || echo unknown)"
log "RESTART ok is-active=${active}"
[[ "${active}" == "active" ]] || exit 1

if [[ -f "${LOG}" ]] && [[ "$(wc -l <"${LOG}")" -gt 400 ]]; then
  tail -n 200 "${LOG}" >"${LOG}.tmp" && mv "${LOG}.tmp" "${LOG}"
fi
exit 0

#!/usr/bin/env bash
# Watchdog for Hub (linuxbox-status :8790) + tunnel origin proxy (:8780) + cloudflared units.
# Evidence (2026-08-05, pc-2026-08-05-hub-exit-mmap-8790-wedge): Hub node stuck in
# exit_mmap D-state -> unit wedged deactivating/final-sigkill (MainPID=0), orphan
# LISTEN on :8790 (~394 CLOSE_WAIT), CF 524/1033. Restart=on-failure never fires for
# hung-but-alive; only a reboot cleared it. Modelled on hermes-gateway-watchdog.sh.
# Units here are SYSTEM scope: query without sudo, mutate via `sudo -n systemctl`
# (same sudoers rule Hub controls already use, linuxbox-systems.js).
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
LOG_DIR="${HUB_WATCHDOG_LOG:-/mnt/archive/logs}"
LOG="${LOG_DIR}/linuxbox-status-watchdog.log"
STATE_DIR="${REPO}/agents/state"
ALERT_JSON="${STATE_DIR}/linuxbox-status-watchdog.json"
WEDGE_AGE_SEC="${HUB_WATCHDOG_WEDGE_AGE_SEC:-120}"
PROBE_TIMEOUT=5
# ponytail: auto-reboot is the only real fix for an exit_mmap wedge, but a cron
# must not reboot production on its own — opt-in only (default off).
AUTO_REBOOT="${HUB_WATCHDOG_REBOOT:-0}"

# "unit probe-url" (no probe = is-active check only, e.g. cloudflared)
UNITS=(
  "linuxbox-status.service http://127.0.0.1:8790/"
  "abhinavall-origin-8780.service http://127.0.0.1:8780/"
  "cloudflared-abhinavall.service"
  "cloudflared-tableslop.service"
)

mkdir -p "${STATE_DIR}" 2>/dev/null || true

log() {
  local line="[$(date -u -Iseconds)] $*"
  echo "${line}"
  if [[ -d "${LOG_DIR}" ]]; then
    echo "${line}" >>"${LOG}" 2>/dev/null || true
  fi
}

write_alert() {
  local status="$1" unit="$2" reason="$3"
  printf '{"status":"%s","unit":"%s","reason":"%s","at":"%s"}\n' \
    "${status}" "${unit}" "${reason}" "$(date -u -Iseconds)" >"${ALERT_JSON}.tmp"
  mv -f "${ALERT_JSON}.tmp" "${ALERT_JSON}"
}

# Pure decision — kept separate from probing so --self-check can exercise it.
# args: active_state pid_state http_code deact_age_sec -> action on stdout
decide_action() {
  local active="$1" pid_state="$2" http_code="$3" deact_age="${4:-0}"
  case "${active}" in
    active)
      if [[ "${pid_state}" == D* ]]; then
        echo "restart_dstate"
      elif [[ "${http_code}" == "000" ]]; then
        echo "restart_hung"
      else
        echo "ok"
      fi
      ;;
    deactivating)
      if [[ "${deact_age}" -ge "${WEDGE_AGE_SEC}" ]]; then
        echo "escalate_wedged"
      else
        echo "ok_winding_down"
      fi
      ;;
    activating) echo "ok_starting" ;;
    *) echo "start" ;; # inactive / failed / unknown
  esac
}

if [[ "${1:-}" == "--self-check" ]]; then
  fails=0
  check() { # expected, then decide_action args
    local want="$1"; shift
    local got; got="$(WEDGE_AGE_SEC=120; decide_action "$@")"
    if [[ "${got}" != "${want}" ]]; then
      echo "FAIL decide_action($*) => '${got}', want '${want}'" >&2
      fails=$((fails + 1))
    fi
  }
  check "restart_dstate" "active" "D" "200" 0
  check "restart_dstate" "active" "Ds" "000" 0
  check "restart_hung" "active" "S" "000" 0
  check "ok" "active" "S" "200" 0
  check "ok" "active" "S" "502" 0 # proxy alive, upstream down — do not restart
  check "ok" "active" "S" "" 0    # no probe configured
  check "ok_winding_down" "deactivating" "" "000" 30
  check "escalate_wedged" "deactivating" "" "000" 121
  check "ok_starting" "activating" "" "000" 0
  check "start" "inactive" "" "000" 0
  check "start" "failed" "" "000" 0
  if [[ "${fails}" -eq 0 ]]; then
    echo "self-check: PASS (11 cases)"
    exit 0
  fi
  echo "self-check: FAIL (${fails})" >&2
  exit 1
fi

sctl_show() { systemctl show "$1" -p ActiveState -p SubState -p MainPID -p ActiveStateEnterTimestamp 2>/dev/null || true; }

field() { printf '%s\n' "$1" | grep "^$2=" | cut -d= -f2- || true; }

deact_age() { # seconds since ActiveStateEnterTimestamp; 0 when unparseable
  local ts="$1" epoch
  epoch="$(date -d "${ts}" +%s 2>/dev/null || echo 0)"
  [[ -n "${epoch}" && "${epoch}" != "0" ]] && echo "$(( $(date +%s) - epoch ))" || echo 0
}

sctl_mutate() { # sudo -n systemctl <verb> <unit>; logs sudo denial instead of dying
  if sudo -n systemctl "$@" 2>/dev/null; then
    return 0
  fi
  log "sudo -n systemctl $* — denied/failed"
  return 1
}

OVERALL="ok"
ACTED=0
for entry in "${UNITS[@]}"; do
  read -r unit probe <<<"${entry}"
  probe="${probe:-}"

  if ! systemctl cat "${unit}" >/dev/null 2>&1; then
    continue # unit not installed on this host
  fi

  show="$(sctl_show "${unit}")"
  active="$(field "${show}" ActiveState)"
  pid="$(field "${show}" MainPID)"
  pid_state="-"
  if [[ "${active}" == "active" && -n "${pid}" && "${pid}" != "0" && -d "/proc/${pid}" ]]; then
    pid_state="$(ps -o state= -p "${pid}" 2>/dev/null | tr -d '[:space:]' || echo '?')"
  fi

  http_code="-"
  if [[ "${active}" == "active" && -n "${probe}" ]]; then
    # Any HTTP response (even 502) proves the listener answers; 000 = refused/timeout.
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "${PROBE_TIMEOUT}" "${probe}" 2>/dev/null || true)"
    http_code="${http_code:-000}"
  fi

  age=0
  if [[ "${active}" == "deactivating" ]]; then
    age="$(deact_age "$(field "${show}" ActiveStateEnterTimestamp)")"
  fi

  action="$(decide_action "${active}" "${pid_state}" "${http_code}" "${age}")"

  case "${action}" in
    ok | ok_winding_down | ok_starting) ;;
    start)
      ACTED=1
      log "${unit} ${active} — starting"
      write_alert "restarting" "${unit}" "inactive state=${active}"
      sctl_mutate start "${unit}" || write_alert "failed_sudo" "${unit}" "start denied"
      ;;
    restart_dstate | restart_hung)
      ACTED=1
      reason="${action} pid=${pid} state=${pid_state} http=${http_code}"
      log "${unit} HUNG — restarting (${reason})"
      write_alert "restarting" "${unit}" "${reason}"
      sctl_mutate restart "${unit}" || write_alert "failed_sudo" "${unit}" "restart denied"
      ;;
    escalate_wedged)
      ACTED=1
      log "${unit} WEDGED deactivating ${age}s — reset-failed + start"
      write_alert "wedged" "${unit}" "deactivating age=${age}s"
      sctl_mutate reset-failed "${unit}" || true
      sctl_mutate start "${unit}" || true
      sleep 5
      if systemctl is-active --quiet "${unit}"; then
        write_alert "recovered" "${unit}" "unwedged after reset-failed"
        log "${unit} recovered after reset-failed"
      else
        OVERALL="wedged"
        write_alert "failed_needs_reboot" "${unit}" "still ${active} after reset-failed (exit_mmap class wedge; reboot or port-hop)"
        log "FAIL ${unit} still wedged — needs reboot (auto: HUB_WATCHDOG_REBOOT=${AUTO_REBOOT})"
        if [[ "${AUTO_REBOOT}" == "1" ]]; then
          sudo -n systemctl reboot || true
        fi
      fi
      ;;
  esac

  # Post-action verify for restart/start paths
  if [[ "${action}" == "start" || "${action}" == restart_* ]]; then
    sleep 3
    if systemctl is-active --quiet "${unit}"; then
      write_alert "recovered" "${unit}" "${action}"
      log "${unit} recovered (${action})"
    else
      OVERALL="failed"
      write_alert "failed" "${unit}" "still not active after ${action}"
      log "FAIL ${unit} not active after ${action}"
    fi
  fi
done

if [[ "${OVERALL}" == "ok" && "${ACTED}" == "0" ]]; then
  write_alert "ok" "all" "units healthy"
fi
exit 0

#!/usr/bin/env bash
# Tiny status for Cursor Auto lane vs Hermes think (parallel — not a shared lock).
# Usage:
#   bash scripts/linuxbox/cursor-lane-status.sh
#   bash scripts/linuxbox/cursor-lane-status.sh --json
set -euo pipefail
REPO="${AGENT_DUMP:-${HOME}/agent-dump}"
# shellcheck source=lib/archive-paths.sh
if [[ -f "${REPO}/scripts/linuxbox/lib/archive-paths.sh" ]]; then
  # shellcheck disable=SC1091
  source "${REPO}/scripts/linuxbox/lib/archive-paths.sh"
fi

CURSOR_PGREP='cursor_sdk_run|cursor-agent-run|nyc-cursor-worldbuilding'
LOG_ROOT="${LINUXBOX_LOG_ROOT:-/mnt/archive/logs}"
CURSOR_LOG_DIR="${LOG_ROOT}/cursor-agent"

# pgrep -af matches ANY cmdline substring — the Hermes think prompt quotes
# "cursor-agent-run.sh" in CLAUDE.md injection, so a running think tick used to
# false-positive this lane as "Cursor running". Keep a pid only when the pattern
# sits in launcher position (first program token after stripping timeout/nohup/etc)
# or the process exe lives under the cursor-agent install.
cursor_lane_pid_is_real() {
  local pid="$1" cmd tokens tok
  cmd="$(tr '\0' ' ' <"/proc/${pid}/cmdline" 2>/dev/null)" || return 1
  [[ -z "${cmd}" ]] && return 1
  # exe under cursor-agent install (covers the `agent -p` binary)
  local exe
  exe="$(readlink "/proc/${pid}/exe" 2>/dev/null || true)"
  if [[ "${exe}" == *cursor-agent* ]]; then return 0; fi
  # strip launcher prefixes: timeout <dur>, nohup, setsid, nice, env, sudo
  local -a toks=()
  read -ra toks <<<"${cmd}"
  local i=0
  while (( i < ${#toks[@]} )); do
    case "${toks[$i]##*/}" in
      timeout) i=$((i+2));;
      nohup|setsid|nice|sudo|env) i=$((i+1));;
      *) break;;
    esac
  done
  # inspect next two tokens (e.g. bash <script> or node <script>)
  local lim=$((i+2)) t base
  while (( i < lim && i < ${#toks[@]} )); do
    t="${toks[$i]}"
    base="${t##*/}"
    case "${base}" in
      cursor-agent-run.sh|cursor_sdk_run|cursor_sdk_run.*|nyc-cursor-worldbuilding|nyc-cursor-worldbuilding.*) return 0;;
    esac
    # any path token containing the cursor-agent install root also counts
    if [[ "${t}" == *cursor-agent* && "${t}" == */* ]]; then return 0; fi
    i=$((i+1))
  done
  return 1
}

cursor_lane_pids() {
  local line p
  pgrep -af "${CURSOR_PGREP}" 2>/dev/null | while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    p="${line%% *}"
    [[ "${p}" == "$$" ]] && continue
    if cursor_lane_pid_is_real "${p}"; then
      echo "${p} ${line#* }"
    fi
  done
}

cursor_lane_json() {
  local running=0 pid="" job="" log_path="" log_mtime="" last_exit="" age_sec=""
  local -a procs_json=()

  if cursor_lane_pids >/tmp/cursor-lane-cur.ps 2>/dev/null && [[ -s /tmp/cursor-lane-cur.ps ]]; then
    running=1
    while IFS= read -r line; do
      [[ -z "${line}" ]] && continue
      local p="${line%% *}"
      local cmd="${line#* }"
      procs_json+=("{\"pid\":${p},\"cmd\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${cmd}")}")
      if [[ -z "${pid}" ]]; then
        pid="${p}"
        age_sec="$(ps -p "${p}" -o etimes= 2>/dev/null | tr -d ' ' || true)"
      fi
    done </tmp/cursor-lane-cur.ps
  fi
  rm -f /tmp/cursor-lane-cur.ps

  if [[ -d "${CURSOR_LOG_DIR}" ]]; then
    log_path="$(ls -t "${CURSOR_LOG_DIR}"/cursor-*.log 2>/dev/null | head -1 || true)"
    if [[ -n "${log_path}" && -f "${log_path}" ]]; then
      log_mtime="$(date -u -r "${log_path}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
      last_exit="$(grep -Eo '--- exit [0-9]+ ---' "${log_path}" 2>/dev/null | tail -1 | grep -Eo '[0-9]+' || true)"
      if [[ -z "${job}" ]]; then
        job="$(python3 - "${log_path}" <<'PY'
import re, sys
p = sys.argv[1]
try:
    raw = open(p, encoding="utf-8", errors="replace").read(12000)
except OSError:
    sys.exit(0)
m = re.search(r"--- prompt ---\s*\n(.*?)\n--- output ---", raw, re.S)
if m:
    line = m.group(1).strip().split("\n")[0].strip()
    if line:
        print(line[:80])
        sys.exit(0)
m2 = re.search(r"=== (cursor-[^\s=]+) ===", raw)
if m2:
    print(m2.group(1)[:80])
PY
)"
      fi
      if [[ "${running}" -eq 1 && -z "${age_sec}" ]]; then
        age_sec="$(($(date +%s) - $(stat -c %Y "${log_path}" 2>/dev/null || echo 0)))"
      fi
    fi
  fi

  local procs="[]"
  if ((${#procs_json[@]} > 0)); then
    procs="[$(IFS=,; echo "${procs_json[*]}")]"
  fi

  # History stats — mirrors what the Hermes card gets from lanes/meta-harness so the
  # two lane cards can show similar rows. Logs are named cursor-YYYYMMDDTHHMMSSZ-pid.log
  # (UTC) with a "--- exit N ---" trailer; no trailer = cut off mid-run.
  local today_utc today_runs=0 today_ok=0 last_outcome="never"
  today_utc="$(date -u +%Y%m%d)"
  if [[ -d "${CURSOR_LOG_DIR}" ]]; then
    local f ex
    for f in "${CURSOR_LOG_DIR}/cursor-${today_utc}T"*.log; do
      [[ -f "${f}" ]] || continue
      today_runs=$((today_runs+1))
      ex="$(grep -Eo -- '--- exit [0-9]+ ---' "${f}" 2>/dev/null | tail -1 | grep -Eo '[0-9]+' || true)"
      [[ "${ex}" == "0" ]] && today_ok=$((today_ok+1))
    done
  fi
  if [[ "${running}" -eq 1 ]]; then
    last_outcome="running"
  elif [[ -n "${log_path}" ]]; then
    if [[ -n "${last_exit}" ]]; then
      if [[ "${last_exit}" == "0" ]]; then last_outcome="ok"; else last_outcome="fail (${last_exit})"; fi
    else
      last_outcome="no exit marker (cut off)"
    fi
  fi

  python3 -c 'import json,sys; print(json.dumps({
    "running": bool(int(sys.argv[1])),
    "pid": int(sys.argv[2]) if sys.argv[2] else None,
    "processes": json.loads(sys.argv[3]),
    "job_label": sys.argv[4] or None,
    "log_path": sys.argv[5] or None,
    "log_mtime": sys.argv[6] or None,
    "last_exit": int(sys.argv[7]) if sys.argv[7] else None,
    "age_sec": int(sys.argv[8]) if sys.argv[8] else None,
    "today_runs": int(sys.argv[9]),
    "today_ok": int(sys.argv[10]),
    "last_outcome": sys.argv[11],
    "schedule": "crontab */5 + CURSOR_INTERVAL_SEC gate (Hermes-style Agent 2; parallel to think)",
    "model_hint": "cursor:auto (SDK)",
  }))' "${running}" "${pid}" "${procs}" "${job}" "${log_path}" "${log_mtime}" "${last_exit}" "${age_sec}" "${today_runs}" "${today_ok}" "${last_outcome}"
}

if [[ "${1:-}" == "--json" ]]; then
  cursor_lane_json
  exit 0
fi

if [[ "${1:-}" == "--self-check" ]]; then
  # Fixture pids get fake /proc trees via an override dir — cursor_lane_pid_is_real
  # reads /proc/<pid>/cmdline and /proc/<pid>/exe, so shadow them in a tmp root.
  # ponytail: simplest faithful shim — re-exec with a proc-root env the filter honors.
  sc_fail=0
  SC_ROOT="$(mktemp -d)"
  # The filter hardcodes /proc — point it at the shim via bind-able override var.
  cursor_lane_pid_is_real_sc() {
    local pid="$1"
    local cmd exe
    cmd="$(cat "${SC_ROOT}/${pid}/cmdline" 2>/dev/null)" || return 1
    exe="$(readlink "${SC_ROOT}/${pid}/exe" 2>/dev/null || true)"
    if [[ "${exe}" == *cursor-agent* ]]; then return 0; fi
    local -a toks=()
    read -ra toks <<<"${cmd}"
    local i=0
    while (( i < ${#toks[@]} )); do
      case "${toks[$i]##*/}" in
        timeout) i=$((i+2));;
        nohup|setsid|nice|sudo|env) i=$((i+1));;
        *) break;;
      esac
    done
    local lim=$((i+2)) t base
    while (( i < lim && i < ${#toks[@]} )); do
      t="${toks[$i]}"; base="${t##*/}"
      case "${base}" in
        cursor-agent-run.sh|cursor_sdk_run|cursor_sdk_run.*|nyc-cursor-worldbuilding|nyc-cursor-worldbuilding.*) return 0;;
      esac
      if [[ "${t}" == *cursor-agent* && "${t}" == */* ]]; then return 0; fi
      i=$((i+1))
    done
    return 1
  }
  sc_mk() { mkdir -p "${SC_ROOT}/$1"; printf '%s' "$2" > "${SC_ROOT}/$1/cmdline"; }
  # 1. hermes think tick quoting cursor-agent-run.sh inside the prompt → EXCLUDE
  sc_mk 101 "timeout 600 /home/abhinav/.local/bin/hermes -p think chat --yolo -q Lane A = potato cursor:auto / cursor-agent-run.sh (Hub or SSH/nohup). Status: bash scripts/linuxbox/cursor-lane-status.sh"
  cursor_lane_pid_is_real_sc 101 && { echo "self-check FAIL: think tick false-positive"; sc_fail=1; }
  # 2. bash cursor-agent-run.sh → INCLUDE
  sc_mk 102 "bash /home/abhinav/agent-dump/scripts/linuxbox/cursor-agent-run.sh fix the map borders"
  cursor_lane_pid_is_real_sc 102 || { echo "self-check FAIL: bash wrapper missed"; sc_fail=1; }
  # 3. timeout 900 bash cursor-agent-run.sh → INCLUDE (launcher strip)
  sc_mk 103 "timeout 900 bash scripts/linuxbox/cursor-agent-run.sh worldbuilding pass"
  cursor_lane_pid_is_real_sc 103 || { echo "self-check FAIL: timeout-wrapped wrapper missed"; sc_fail=1; }
  # 4. cursor agent binary via exe symlink → INCLUDE (exe rule). git-bash ln -s falls
  # back to copy and fails on missing sources — there, assert the same path via the
  # cmdline-token rule instead (exe branch still verified when ln works, e.g. potato).
  mkdir -p "${SC_ROOT}/104"
  if ln -s /home/abhinav/.local/share/cursor-agent/versions/2026.06/agent "${SC_ROOT}/104/exe" 2>/dev/null && [[ -n "$(readlink "${SC_ROOT}/104/exe" 2>/dev/null)" ]]; then
    printf 'agent -p --force draft NYC boroughs' > "${SC_ROOT}/104/cmdline"
  else
    printf 'node /home/abhinav/.local/share/cursor-agent/versions/2026.06/cli.js -p draft NYC boroughs' > "${SC_ROOT}/104/cmdline"
  fi
  cursor_lane_pid_is_real_sc 104 || { echo "self-check FAIL: agent binary missed"; sc_fail=1; }
  # 5. unrelated hermes child (no prompt mention) → EXCLUDE
  sc_mk 105 "/home/abhinav/.hermes/hermes-agent/venv/bin/python3 /home/abhinav/.hermes/hermes-agent/venv/bin/hermes -p chat chat -m poolside/laguna-xs-2.1:free"
  cursor_lane_pid_is_real_sc 105 && { echo "self-check FAIL: plain hermes false-positive"; sc_fail=1; }
  # 6. nohup nyc-cursor-worldbuilding wrapper → INCLUDE
  sc_mk 106 "nohup bash /home/abhinav/agent-dump/scripts/linuxbox/nyc-cursor-worldbuilding.sh"
  cursor_lane_pid_is_real_sc 106 || { echo "self-check FAIL: nohup worldbuilding missed"; sc_fail=1; }
  rm -rf "${SC_ROOT}"
  if [[ "${sc_fail}" -eq 0 ]]; then echo "cursor-lane-status self_check OK"; else echo "cursor-lane-status self_check FAIL"; exit 1; fi
  exit 0
fi

echo "=== Cursor Auto ∥ Hermes OR+ZenMux ==="

echo "--- think ---"
if pgrep -af 'agent-cycle-think-tick' >/tmp/cursor-lane-think.ps 2>/dev/null; then
  echo "think: RUNNING"
  head -n 3 /tmp/cursor-lane-think.ps
else
  echo "think: idle (no think-tick process)"
fi
rm -f /tmp/cursor-lane-think.ps
FOCUS="${REPO}/agents/state/think-focus.json"
if [[ -f "${FOCUS}" ]]; then
  echo "think-focus: $(head -c 200 "${FOCUS}" | tr '\n' ' ')"
fi

echo "--- cursor processes ---"
cursor_lane_pids > /tmp/cursor-lane-cur.ps 2>/dev/null || true
if [[ -s /tmp/cursor-lane-cur.ps ]]; then
  cat /tmp/cursor-lane-cur.ps
else
  echo "(none)"
fi
rm -f /tmp/cursor-lane-cur.ps

echo "--- last cursor-agent log ---"
if [[ -d "${CURSOR_LOG_DIR}" ]]; then
  L=$(ls -t "${CURSOR_LOG_DIR}"/cursor-*.log 2>/dev/null | head -1 || true)
  if [[ -n "${L:-}" ]]; then
    echo "log=${L}"
    tail -n 8 "${L}" 2>/dev/null || true
  else
    echo "(no cursor-*.log yet)"
  fi
else
  echo "(no ${CURSOR_LOG_DIR})"
fi

echo "--- last nyc Phase F log ---"
L2=$(ls -t "${LOG_ROOT}"/nyc-cursor-phase-f-*.log 2>/dev/null | head -1 || true)
if [[ -n "${L2:-}" ]]; then
  echo "log=${L2}"
  tail -n 5 "${L2}" 2>/dev/null || true
else
  echo "(none)"
fi

echo "--- policy ---"
echo "CURSOR_SDK_AUTO_ONLY=1; cursor not on think cron; Hub separate Cursor/Hermes chat workers."

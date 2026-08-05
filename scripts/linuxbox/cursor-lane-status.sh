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

cursor_lane_json() {
  local running=0 pid="" job="" log_path="" log_mtime="" last_exit="" age_sec=""
  local -a procs_json=()

  if pgrep -af "${CURSOR_PGREP}" >/tmp/cursor-lane-cur.ps 2>/dev/null; then
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

  python3 -c 'import json,sys; print(json.dumps({
    "running": bool(int(sys.argv[1])),
    "pid": int(sys.argv[2]) if sys.argv[2] else None,
    "processes": json.loads(sys.argv[3]),
    "job_label": sys.argv[4] or None,
    "log_path": sys.argv[5] or None,
    "log_mtime": sys.argv[6] or None,
    "last_exit": int(sys.argv[7]) if sys.argv[7] else None,
    "age_sec": int(sys.argv[8]) if sys.argv[8] else None,
  }))' "${running}" "${pid}" "${procs}" "${job}" "${log_path}" "${log_mtime}" "${last_exit}" "${age_sec}"
}

if [[ "${1:-}" == "--json" ]]; then
  cursor_lane_json
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
if pgrep -af "${CURSOR_PGREP}" >/tmp/cursor-lane-cur.ps 2>/dev/null; then
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

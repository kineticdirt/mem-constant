#!/usr/bin/env bash
# Cursor Auto twin — parallel copy of a Hermes/pod task (Agent 2 ∥ Agent 1).
#
# Usage:
#   bash scripts/linuxbox/cursor-twin-dispatch.sh \
#     --source think|ponytail-cleanup|idle-fill \
#     --goal "short goal" \
#     [--task-id ID] \
#     [--prompt-file PATH | --prompt TEXT]
#
# Kill-switch: CURSOR_PARALLEL=0
# Memory gate: skip when MemAvailable ≤ CURSOR_TWIN_MIN_AVAIL_MB (default 500).
# Already-running Cursor: skip (no pile-up).
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

REAL_HOME="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6)"
REAL_HOME="${REAL_HOME:-/home/$(id -un)}"
REPO="${AGENT_DUMP:-${REAL_HOME}/agent-dump}"
if [[ "${REPO}" == */.hermes/profiles/* ]]; then
  REPO="${REAL_HOME}/agent-dump"
fi

SOURCE="manual"
GOAL=""
TASK_ID=""
PROMPT=""
PROMPT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="${2:-manual}"; shift 2 ;;
    --goal) GOAL="${2:-}"; shift 2 ;;
    --task-id) TASK_ID="${2:-}"; shift 2 ;;
    --prompt) PROMPT="${2:-}"; shift 2 ;;
    --prompt-file) PROMPT_FILE="${2:-}"; shift 2 ;;
    --self-check)
      test -f "${REPO}/scripts/linuxbox/cursor-agent-run.sh"
      echo "cursor-twin-dispatch self-check OK"
      exit 0
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "${CURSOR_PARALLEL:-1}" != "1" ]]; then
  echo "cursor-twin: skip CURSOR_PARALLEL=0"
  exit 0
fi

if [[ -n "${PROMPT_FILE}" ]]; then
  PROMPT="$(head -c 12000 "${PROMPT_FILE}" 2>/dev/null || true)"
fi

if [[ -z "${PROMPT}" ]]; then
  if [[ -z "${GOAL}" ]]; then
    echo "cursor-twin: need --goal or --prompt/--prompt-file" >&2
    exit 2
  fi
  PROMPT="You are Agent 2 (Cursor Auto) — twin of Hermes Agent 1 on linuxbox potato.
Workdir: ${REPO}. Follow CLAUDE.md + AGENTS.md. Ponytail: smallest correct change.
Do NOT wipe agents/state, characters-registry, or regions-ui.json.

GOAL (match Hermes current item — one concrete step, then stop):
  ${GOAL}
${TASK_ID:+Task id: ${TASK_ID}}

Verify with one concrete check (script exit 0 / curl 200 / file exists / checkbox closed).
Append one [LINUX] Result line to AI_GROUPCHAT.md when done.
"
fi

ENV_FILE="${CURSOR_AGENT_ENV:-${REAL_HOME}/.cursor-agent.env}"
# shellcheck disable=SC1090
[[ -f "${ENV_FILE}" ]] && set -a && source "${ENV_FILE}" && set +a
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "cursor-twin: skip no CURSOR_API_KEY in ${ENV_FILE}"
  exit 0
fi

STATUS_SH="${REPO}/scripts/linuxbox/cursor-lane-status.sh"
if [[ -f "${STATUS_SH}" ]]; then
  if bash "${STATUS_SH}" --json 2>/dev/null | grep -q '"running": true'; then
    echo "cursor-twin: skip Cursor already running"
    exit 0
  fi
fi

MIN_AVAIL="${CURSOR_TWIN_MIN_AVAIL_MB:-500}"
AVAIL_MB="$(awk '/MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
if [[ "${AVAIL_MB}" -gt 0 && "${AVAIL_MB}" -le "${MIN_AVAIL}" ]]; then
  echo "cursor-twin: skip low MemAvailable=${AVAIL_MB}MiB (min ${MIN_AVAIL})"
  exit 0
fi

STAMP="${REPO}/agents/state/cursor-twin-dispatch.last"
FORCE="${REPO}/agents/state/cursor-twin.force"
mkdir -p "${REPO}/agents/state"
now_epoch="$(date +%s)"
if [[ -f "${FORCE}" ]]; then
  rm -f "${FORCE}"
elif [[ -f "${STAMP}" ]]; then
  last="$(tr -dc '0-9' < "${STAMP}" | head -c 12 || true)"
  if [[ -n "${last}" ]]; then
    age=$((now_epoch - last))
    if (( age < ${CURSOR_TWIN_COOLDOWN_SEC:-180} )); then
      echo "cursor-twin: skip cooldown ${age}s < ${CURSOR_TWIN_COOLDOWN_SEC:-180}s"
      exit 0
    fi
  fi
fi

RUNNER="${REPO}/scripts/linuxbox/cursor-agent-run.sh"
if [[ ! -f "${RUNNER}" ]]; then
  echo "cursor-twin: FAIL missing ${RUNNER}" >&2
  exit 1
fi

LOG_DIR="/mnt/archive/logs/cursor-agent"
if [[ ! -d /mnt/archive/logs ]]; then
  LOG_DIR="${REPO}/agents/runs/cursor-agent"
fi
mkdir -p "${LOG_DIR}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUTER_LOG="${LOG_DIR}/cursor-twin-${SOURCE}-${TS}.log"
RUN_ID="cursor-twin-${SOURCE}-${TS}"

FULL_PROMPT="[Cursor twin · source=${SOURCE} · match Hermes]
${PROMPT}"

export CURSOR_SDK_AUTO_ONLY=1
export CURSOR_AGENT_TIMEOUT_SEC="${CURSOR_AGENT_TIMEOUT_SEC:-1200}"
if [[ -n "${TASK_ID}" ]]; then
  export CURSOR_TASK_ID="${TASK_ID}"
fi

FOCUS="${REPO}/agents/state/cursor-focus.json"
export CT_FOCUS="${FOCUS}" CT_GOAL="${GOAL:-$SOURCE}" CT_TASK="${TASK_ID}" CT_SOURCE="${SOURCE}" CT_RUN="${RUN_ID}" CT_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
python3 - <<'PY'
import json, os
from pathlib import Path
fp = Path(os.environ["CT_FOCUS"])
rec = {
  "status": "running",
  "blurb": (os.environ.get("CT_GOAL") or "cursor twin")[:200],
  "task_id": os.environ.get("CT_TASK") or None,
  "source": os.environ.get("CT_SOURCE") or "manual",
  "twin": True,
  "pid": None,
  "run_id": os.environ.get("CT_RUN"),
  "started_at": os.environ.get("CT_TS"),
  "updated_at": os.environ.get("CT_TS"),
}
fp.parent.mkdir(parents=True, exist_ok=True)
fp.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
PY

nohup bash "${RUNNER}" "${FULL_PROMPT}" >> "${OUTER_LOG}" 2>&1 &
PID=$!
echo "${PID}" > "${REPO}/agents/state/cursor-tick.pid"
echo "${now_epoch}" > "${STAMP}"

export CT_PID="${PID}" CT_LOG="${OUTER_LOG}"
python3 - <<'PY'
import json, os
from pathlib import Path
fp = Path(os.environ["CT_FOCUS"])
try:
  d = json.loads(fp.read_text(encoding="utf-8"))
except Exception:
  d = {}
d["pid"] = int(os.environ["CT_PID"])
d["log_path"] = os.environ.get("CT_LOG")
fp.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")
PY

echo "cursor-twin: dispatched source=${SOURCE} pid=${PID} log=${OUTER_LOG} goal=${GOAL:0:80}"
exit 0

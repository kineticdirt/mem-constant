#!/usr/bin/env bash
# Gated Cursor agent lane for Hub Chat / explicit [ops] — NOT for think/sync crons.
# Prefers the official Python SDK (cursor-sdk); optional CLI fallback if SDK missing.
# Parallel with Hermes: does NOT take /tmp/agent-cycle-think.lock. Safe under nohup —
# Hermes think/chat (OR+ZenMux) keep running while this runs.
# Usage:
#   bash scripts/linuxbox/cursor-agent-run.sh "one-shot prompt"
#   echo "prompt" | bash scripts/linuxbox/cursor-agent-run.sh
#   nohup bash scripts/linuxbox/cursor-agent-run.sh "…" > /mnt/archive/logs/cursor-agent/nohup.log 2>&1 &
# Env: CURSOR_API_KEY in ~/.cursor-agent.env (chmod 600)
#      CURSOR_SDK_RUNTIME=local|cloud (default local)
#      CURSOR_SDK_MODEL / CURSOR_VARIANT (default auto → auto-smart balanced)
#      CURSOR_SDK_AUTO_ONLY=1 (forced) — never fall through to paid Cursor models
set -euo pipefail

REPO="${AGENT_DUMP:-${HOME}/agent-dump}"
# shellcheck source=lib/archive-paths.sh
source "${REPO}/scripts/linuxbox/lib/archive-paths.sh"

ENV_FILE="${CURSOR_AGENT_ENV:-${HOME}/.cursor-agent.env}"
SDK_PY="${REPO}/scripts/linuxbox/cursor_sdk_run.py"
TIMEOUT_SEC="${CURSOR_AGENT_TIMEOUT_SEC:-300}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="cursor-${STAMP}-$$"
PYTHON_BIN="${CURSOR_SDK_PYTHON:-${HOME}/venvs/cursor-sdk/bin/python}"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="${CURSOR_SDK_PYTHON:-python3}"
fi

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
fi

if archive_logs_ready; then
  LOG_DIR="${LINUXBOX_LOG_ROOT}/cursor-agent"
else
  LOG_DIR="${REPO}/agents/runs/cursor-agent"
fi
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/${RUN_ID}.log"

PROMPT="${*:-}"
if [[ -z "${PROMPT}" ]]; then
  PROMPT="$(cat)"
fi
if [[ -z "${PROMPT}" ]]; then
  echo "ERROR: empty prompt (pass as arg or stdin)" >&2
  exit 2
fi

# Papercuts: Cursor Auto may append friction to agents/papercuts.md at end of run.
PROMPT="${PROMPT}

(Optional, end of run) If you hit friction worth remembering — unclear env, repeated failures, misleading UX, regressions — append one entry to agents/papercuts.md per docs/agents/papercuts.md. Never let papercut logging block or replace the task."

# Human goals from Hub Tasks → Active now — same injection the think lane gets,
# so this run can check its actions against what is expected. Pause NOT honored
# here: an explicit Cursor run is itself a human launch.
GOAL_CTRL="${REPO}/agents/state/agent-goal-control.json"
if [[ -f "${GOAL_CTRL}" ]]; then
  GOAL_INJECT="$(python3 "${REPO}/scripts/linuxbox/goal-inject.py" "${GOAL_CTRL}" 2>/dev/null || true)"
  if [[ -n "${GOAL_INJECT}" ]]; then
    PROMPT="${GOAL_INJECT}

${PROMPT}"
  fi
fi

VARIANT="${CURSOR_VARIANT:-auto}"
# Potato policy: Cursor Auto only — never pin paid SDK models from the wrapper.
if [[ "${VARIANT}" != "auto" && "${VARIANT}" != "default" ]]; then
  echo "[cursor-agent-run] forcing VARIANT=auto (potato Auto-only; was ${VARIANT})" >&2
  VARIANT="auto"
fi
RUNTIME="${CURSOR_SDK_RUNTIME:-local}"
export CURSOR_SDK_AUTO_ONLY=1

{
  echo "=== ${RUN_ID} ==="
  echo "repo=${REPO}"
  echo "runtime=python-sdk/${RUNTIME}"
  echo "model=${VARIANT}"
  echo "timeout_sec=${TIMEOUT_SEC}"
  echo "python=$(${PYTHON_BIN} --version 2>&1 || echo unknown)"
  echo "--- prompt ---"
  echo "${PROMPT}"
  echo "--- output ---"
} >>"${LOG_FILE}"

run_sdk() {
  timeout "${TIMEOUT_SEC}" \
    env CURSOR_VARIANT="${VARIANT}" CURSOR_SDK_RUNTIME="${RUNTIME}" \
    "${PYTHON_BIN}" "${SDK_PY}" --cwd "${REPO}" --model "${VARIANT}" --runtime "${RUNTIME}" \
    "${PROMPT}"
}

run_cli_fallback() {
  local AGENT_BIN="${CURSOR_AGENT_BIN:-${HOME}/.local/bin/agent}"
  if ! command -v "${AGENT_BIN}" >/dev/null 2>&1; then
    echo "ERROR: cursor-sdk unavailable and Cursor CLI not found at ${AGENT_BIN}" >&2
    return 127
  fi
  echo "[cursor-agent-run] WARNING: falling back to Cursor CLI (prefer: pip3 install --user cursor-sdk)" >&2
  timeout "${TIMEOUT_SEC}" "${AGENT_BIN}" -p --force --disable-auto-update "${PROMPT}"
}

set +e
if [[ -f "${SDK_PY}" ]] && ${PYTHON_BIN} -c "import cursor_sdk" 2>/dev/null; then
  run_sdk 2>&1 | tee -a "${LOG_FILE}"
  status=${PIPESTATUS[0]}
else
  if [[ -f "${SDK_PY}" ]]; then
    echo "[cursor-agent-run] cursor-sdk not importable; trying CLI fallback" | tee -a "${LOG_FILE}" >&2
  fi
  run_cli_fallback 2>&1 | tee -a "${LOG_FILE}"
  status=${PIPESTATUS[0]}
fi
set -e

{
  echo "--- exit ${status} ---"
} >>"${LOG_FILE}"

if [[ "${status}" -eq 124 ]]; then
  echo "ERROR: Cursor agent timed out after ${TIMEOUT_SEC}s (log: ${LOG_FILE})" >&2
  exit 124
fi

exit "${status}"

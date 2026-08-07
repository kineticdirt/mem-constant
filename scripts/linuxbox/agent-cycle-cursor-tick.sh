#!/usr/bin/env bash
# Agent 2 — Cursor Auto parallel lane (Hermes-style tick).
#
# Runs BESIDE Hermes think (Agent 1). Does NOT take /tmp/agent-cycle-think.lock.
# Own flock: /tmp/agent-cycle-cursor.lock. Interval-gated (default 15m).
# Picks one Cursor-lane user-task and dispatches cursor-agent-run.sh in background.
#
# Cron: every 5m (interval gate inside). Install via install-agent-cycle-think-only.sh
# (also installs this tick) or:
#   */5 * * * * /home/abhinav/agent-dump/scripts/linuxbox/agent-cycle-cursor-tick.sh # agent-cycle-cursor-5m
#
# Kill-switch: CURSOR_TICK=0
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

if [[ "${CURSOR_TICK:-1}" != "1" ]]; then
  exit 0
fi

REAL_HOME="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6)"
REAL_HOME="${REAL_HOME:-/home/$(id -un)}"
REPO="${AGENT_DUMP:-${REAL_HOME}/agent-dump}"
if [[ "${REPO}" == */.hermes/profiles/* ]]; then
  REPO="${REAL_HOME}/agent-dump"
fi

LOCK="/tmp/agent-cycle-cursor.lock"
exec 201>"${LOCK}"
flock -n 201 || exit 0

# shellcheck source=lib/archive-paths.sh
source "${REPO}/scripts/linuxbox/lib/archive-paths.sh" 2>/dev/null || true
if [[ "${REPO}" == */.hermes/profiles/* ]]; then
  REPO="${REAL_HOME}/agent-dump"
fi

INTERVAL_SEC="${CURSOR_INTERVAL_SEC:-900}"
STAMP_FILE="${REPO}/agents/state/cursor-tick.last"
STATE_DIR="${REPO}/agents/state"
mkdir -p "${STATE_DIR}"

now_epoch="$(date +%s)"
if [[ -f "${STAMP_FILE}" ]]; then
  last="$(tr -dc '0-9' < "${STAMP_FILE}" | head -c 12 || true)"
  if [[ -n "${last}" ]]; then
    age=$((now_epoch - last))
    if (( age < INTERVAL_SEC )); then
      exit 0
    fi
  fi
fi

# Already running?
if bash "${REPO}/scripts/linuxbox/cursor-lane-status.sh" --json 2>/dev/null | grep -q '"running": true'; then
  exit 0
fi

ENV_FILE="${CURSOR_AGENT_ENV:-${REAL_HOME}/.cursor-agent.env}"
# shellcheck disable=SC1090
[[ -f "${ENV_FILE}" ]] && set -a && source "${ENV_FILE}" && set +a
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  # One-line skip (not a Hub spam). Key must live in real-home .cursor-agent.env
  echo "[cursor-tick] skip: no CURSOR_API_KEY in ${ENV_FILE}" >&2
  # Still advance stamp so we do not log every 5m forever when key missing
  echo "${now_epoch}" > "${STAMP_FILE}"
  exit 0
fi

PICK_JSON="$(python3 "${REPO}/scripts/linuxbox/cursor-pick-task.py" --repo "${REPO}" --json 2>/dev/null || echo '{}')"
TASK_ID="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); t=d.get('task') or {}; print(t.get('id') or '')" "${PICK_JSON}")"
TASK_TITLE="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); t=d.get('task') or {}; print((t.get('title') or '')[:200])" "${PICK_JSON}")"
TASK_BODY="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); t=d.get('task') or {}; print((t.get('body') or '')[:800])" "${PICK_JSON}")"

if [[ -z "${TASK_ID}" ]]; then
  echo "${now_epoch}" > "${STAMP_FILE}"
  exit 0
fi

# Ensure a work packet so Cursor gets a tick-sized unit (same SoT as Hermes).
if [[ -f "${REPO}/scripts/linuxbox/think-work-packet.py" ]]; then
  python3 "${REPO}/scripts/linuxbox/think-work-packet.py" ensure \
    --repo "${REPO}" --task-id "${TASK_ID}" --blurb "${TASK_TITLE}" --body "${TASK_BODY}" \
    >/dev/null 2>&1 || true
fi
PACKET_JSON="$(python3 "${REPO}/scripts/linuxbox/think-work-packet.py" active --repo "${REPO}" --task-id "${TASK_ID}" 2>/dev/null || echo '{}')"
PACKET_GOAL="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); a=d.get('active') or {}; print((a.get('goal') or '')[:300])" "${PACKET_JSON}")"
PACKET_VERIFY="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); a=d.get('active') or {}; print((a.get('verify') or '')[:200])" "${PACKET_JSON}")"
PACKET_ID="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); a=d.get('active') or {}; print(a.get('id') or '')" "${PACKET_JSON}")"

AUTH_BLOCK=""
if [[ -f "${REPO}/scripts/linuxbox/human-authored.py" ]]; then
  AUTH_BLOCK="$(python3 "${REPO}/scripts/linuxbox/human-authored.py" block --repo "${REPO}" 2>/dev/null || true)"
fi

PROMPT="You are Agent 2 (Cursor Auto) on linuxbox potato — parallel to Hermes think (Agent 1).
Workdir: ${REPO}. Follow CLAUDE.md + AGENTS.md. Ponytail: smallest correct change.

USER TASK (do ONE work packet only, then stop):
  id: ${TASK_ID}
  title: ${TASK_TITLE}
${TASK_BODY:+  body: ${TASK_BODY}}

WORK PACKET:
  id: ${PACKET_ID}
  goal: ${PACKET_GOAL:-smallest correct implement+verify for the task}
  verify: ${PACKET_VERIFY:-concrete script/curl/file check then mark packet done}

When verify passes:
  python3 scripts/linuxbox/think-work-packet.py complete --repo . --packet-id ${PACKET_ID}
Only set agents/user-tasks.json status=done when all packets for this task are done.
If blocked (needs secrets/human): set status=blocked + one rich inbox item — never leave open after claiming blocked.

${AUTH_BLOCK}

Do not reverse GM/Cursor-authored paths. Do not wipe agents/state or characters-registry.
Append one [LINUX] Result line to AI_GROUPCHAT.md when done.
"

LOG_DIR="/mnt/archive/logs/cursor-agent"
if [[ ! -d /mnt/archive/logs ]]; then
  LOG_DIR="${REPO}/agents/runs/cursor-agent"
fi
mkdir -p "${LOG_DIR}"
OUTER_LOG="${LOG_DIR}/cursor-tick-$(date -u +%Y%m%dT%H%M%SZ).log"

export CURSOR_SDK_AUTO_ONLY=1
export CURSOR_AGENT_TIMEOUT_SEC="${CURSOR_AGENT_TIMEOUT_SEC:-1200}"
nohup bash "${REPO}/scripts/linuxbox/cursor-agent-run.sh" "${PROMPT}" \
  >> "${OUTER_LOG}" 2>&1 &
echo $! > "${STATE_DIR}/cursor-tick.pid"
echo "${now_epoch}" > "${STAMP_FILE}"
echo "[cursor-tick] dispatched task=${TASK_ID} log=${OUTER_LOG} pid=$!"
exit 0

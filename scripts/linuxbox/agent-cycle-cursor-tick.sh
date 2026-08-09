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
FORCE_FILE="${REPO}/agents/state/cursor-tick.force"
STATE_DIR="${REPO}/agents/state"
mkdir -p "${STATE_DIR}"

now_epoch="$(date +%s)"
if [[ -f "${FORCE_FILE}" ]]; then
  rm -f "${FORCE_FILE}"
  INTERVAL_SEC=0
fi
# When open Cursor-lane work exists, poll more often (5m effective) — idle is the bug.
OPEN_N="$(python3 -c "
import json
from pathlib import Path
p=Path('${REPO}')/'agents'/'user-tasks.json'
try:
  t=json.loads(p.read_text()).get('tasks') or []
except Exception:
  t=[]
n=sum(1 for x in t if isinstance(x,dict) and str(x.get('status') or '').lower() in ('open','pending',''))
print(n)
" 2>/dev/null || echo 0)"
if [[ "${OPEN_N}" -gt 0 && "${INTERVAL_SEC}" -gt 300 ]]; then
  INTERVAL_SEC=300
fi
if [[ -f "${STAMP_FILE}" ]]; then
  last="$(tr -dc '0-9' < "${STAMP_FILE}" | head -c 12 || true)"
  if [[ -n "${last}" ]]; then
    age=$((now_epoch - last))
    if (( age < INTERVAL_SEC )); then
      exit 0
    fi
  fi
fi

# Already running? Missing status script must not abort the tick (set -e).
_cursor_running=0
if [[ -f "${REPO}/scripts/linuxbox/cursor-lane-status.sh" ]]; then
  if bash "${REPO}/scripts/linuxbox/cursor-lane-status.sh" --json 2>/dev/null | grep -q '"running": true'; then
    _cursor_running=1
  fi
fi
if [[ "${_cursor_running}" -eq 1 ]]; then
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

# Empty queue → deterministic continuity seed (city lived-in + backlog) then re-pick.
if [[ -z "${TASK_ID}" && -f "${REPO}/scripts/linuxbox/think-continuity-seed.py" ]]; then
  python3 "${REPO}/scripts/linuxbox/think-continuity-seed.py" --repo "${REPO}" >/dev/null 2>&1 || true
  PICK_JSON="$(python3 "${REPO}/scripts/linuxbox/cursor-pick-task.py" --repo "${REPO}" --json 2>/dev/null || echo '{}')"
  TASK_ID="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); t=d.get('task') or {}; print(t.get('id') or '')" "${PICK_JSON}")"
  TASK_TITLE="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); t=d.get('task') or {}; print((t.get('title') or '')[:200])" "${PICK_JSON}")"
  TASK_BODY="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); t=d.get('task') or {}; print((t.get('body') or '')[:800])" "${PICK_JSON}")"
fi

# Idle fill: no user-task → ponytail board OR stack self-improve (never sit idle).
if [[ -z "${TASK_ID}" ]]; then
  TWIN="${REPO}/scripts/linuxbox/cursor-twin-dispatch.sh"
  IDLE_GOAL=""
  IDLE_PROMPT=""
  if [[ -f "${REPO}/agents/PONYTAIL_CLEANUP_BOARD.md" ]] \
    && grep -qE '^[[:space:]]*[-*][[:space:]]*\[[[:space:]]\]' "${REPO}/agents/PONYTAIL_CLEANUP_BOARD.md" 2>/dev/null; then
    IDLE_GOAL="ponytail-cleanup: one Backlog card from PONYTAIL_CLEANUP_BOARD.md"
    IDLE_PROMPT="You are Agent 2 (Cursor Auto) idle-fill on potato.
Read agents/PONYTAIL_CLEANUP_TASK.md + agents/PONYTAIL_CLEANUP_BOARD.md.
Take ONE unchecked Backlog card. Fix/refine in place — NO file deletions.
Verify (py_compile / bash -n). Move card to Done. Append [LINUX] Result to AI_GROUPCHAT.md."
  elif [[ -f "${REPO}/agents/SELF_IMPROVE_PROGRESS.md" ]] \
    && grep -qE '^[[:space:]]*[-*][[:space:]]*\[[[:space:]]\]' "${REPO}/agents/SELF_IMPROVE_PROGRESS.md" 2>/dev/null; then
    IDLE_GOAL="self-improve: one open box from SELF_IMPROVE_PROGRESS.md (S2/S3)"
    IDLE_PROMPT="You are Agent 2 (Cursor Auto) idle-fill — stack self-improve.
Read agents/SELF_IMPROVE_PROGRESS.md. Do ONE unchecked Open box (prefer S2 then S3).
Smallest correct implement+verify. Flip [ ]→[x] + Done note. Append [LINUX] Result."
  elif [[ -f "${REPO}/agents/self-improvement-progress.md" ]] \
    && grep -qE '^[[:space:]]*[-*][[:space:]]*\[[[:space:]]\]' "${REPO}/agents/self-improvement-progress.md" 2>/dev/null; then
    IDLE_GOAL="education: one drill from self-improvement-progress.md"
    IDLE_PROMPT="You are Agent 2 (Cursor Auto) idle-fill — human education lane.
Read agents/SELF_IMPROVEMENT_TASK.md + agents/self-improvement-progress.md.
One short free-first drill → reports/self-improvement/ or reports/education/.
Flip one [ ]→[x]. No inbox spam. Append [LINUX] Result."
  fi
  if [[ -n "${IDLE_GOAL}" && -f "${TWIN}" ]]; then
    date +%s > "${REPO}/agents/state/cursor-twin.force" 2>/dev/null || true
    bash "${TWIN}" --source idle-fill --goal "${IDLE_GOAL}" --prompt "${IDLE_PROMPT}" \
      || true
    echo "${now_epoch}" > "${STAMP_FILE}"
    echo "[cursor-tick] idle-fill twin: ${IDLE_GOAL}"
    exit 0
  fi
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

RUNNER="${REPO}/scripts/linuxbox/cursor-agent-run.sh"
if [[ ! -f "${RUNNER}" ]]; then
  mkdir -p "${LOG_DIR}"
  echo "[cursor-tick] FAIL: missing ${RUNNER} (task=${TASK_ID}) — restore via push-linuxbox or SCP; do not stamp as success" >&2
  echo "missing_runner $(date -u +%Y-%m-%dT%H:%M:%SZ) task=${TASK_ID}" >> "${STATE_DIR}/cursor-tick.errors"
  # Do not advance stamp — next cron retry once file is restored
  exit 1
fi

export CURSOR_SDK_AUTO_ONLY=1
export CURSOR_AGENT_TIMEOUT_SEC="${CURSOR_AGENT_TIMEOUT_SEC:-1200}"
export CURSOR_TASK_ID="${TASK_ID}"
nohup bash "${RUNNER}" "${PROMPT}" \
  >> "${OUTER_LOG}" 2>&1 &
echo $! > "${STATE_DIR}/cursor-tick.pid"
echo "${now_epoch}" > "${STAMP_FILE}"
echo "[cursor-tick] dispatched task=${TASK_ID} log=${OUTER_LOG} pid=$!"
exit 0

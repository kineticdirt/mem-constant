#!/usr/bin/env bash
# Think lane tick (crontab every 1m; adaptive throttle).
# Quiet backlog → min 5m between LLM ticks; large backlog → allow every 1m.
# IDLE short-circuit: no unchecked work → skip LLM, stamp heartbeat.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
LOCK="/tmp/agent-cycle-think.lock"
exec 200>"${LOCK}"
flock -n 200 || exit 0

# Seconds between LLM think runs (overridable)
QUIET_INTERVAL_SEC="${THINK_QUIET_INTERVAL_SEC:-300}"   # 5m when some work
BUSY_INTERVAL_SEC="${THINK_BUSY_INTERVAL_SEC:-60}"      # 1m when large backlog
BUSY_OPEN_TASKS="${THINK_BUSY_OPEN_TASKS:-4}"           # open user-tasks threshold

PROMPT='Think lane (profile think). Workdir agent-dump. Read agents/CURRENT_TASK.md. Do NOT run git pull (fast tick owns sync via apply-git-bundle + git-pull-and-deploy; private repo uses bundles). Skip sync if dirty and continue to the next lane — never inbox for git pull alone. Terminal for normal ops is already granted on cron (git status, scripts, smoke, systemctl restart linuxbox-status) — do NOT invent "terminal blocked" and do NOT inbox asking to approve one terminal tick. Before inbox: read agents/state/human-inbox.json open+answered and agents/inbox-seeds.json — never re-ask equivalent open/answered items. Complete ONE unchecked lane step, verify, mark done; if truly blocked on a human judgment call append ONE entry to agents/state/human-inbox.json "open" array only (must keep {"open":[],"answered":[]} shape — NEVER replace the whole file with a bare array; run python3 scripts/linuxbox/human-inbox-normalize.py after editing); else reply IDLE only. Prefer self-improve / correctness when lanes compete; ask Inbox rather than guess.'

cd "${REPO}"
mkdir -p "${REPO}/agents/state"
python3 "${REPO}/scripts/linuxbox/human-inbox-normalize.py" "${REPO}" --quiet 2>/dev/null || true

# S1: shrink profile DBs before chat if bloated (set HERMES_PROFILE_DB_GUARD=0 to skip)
GUARD="${REPO}/scripts/linuxbox/hermes-profile-db-guard.sh"
if [[ "${HERMES_PROFILE_DB_GUARD:-1}" != "0" ]] && [[ -f "${GUARD}" ]]; then
  bash "${GUARD}" >/dev/null 2>&1 || true
fi

HAS_WORK="${REPO}/scripts/linuxbox/agent-cycle-has-work.py"
if [[ -f "${HAS_WORK}" ]]; then
  set +e
  python3 "${HAS_WORK}" --lane think --repo "${REPO}"
  hw_rc=$?
  set -e
  if [[ "${hw_rc}" -eq 1 ]]; then
    date -Iseconds > "${REPO}/agents/state/think-tick.last"
    META="${REPO}/scripts/linuxbox/archive_meta.py"
    LOG="${REPO}/agents/runs/think-idle-preflight.log"
    mkdir -p "$(dirname "${LOG}")"
    echo "IDLE (deterministic preflight; no LLM)" > "${LOG}"
    if [[ -f "${META}" ]]; then
      python3 "${META}" append agent_runs think 0 "${LOG}" "IDLE think preflight" 2>/dev/null || true
    fi
    exit 0
  fi
fi

# Adaptive throttle: large open-task backlog → 1m; else ≥5m between LLM runs
open_n=0
if [[ -f "${REPO}/agents/user-tasks.json" ]]; then
  open_n="$(python3 -c "
import json
from pathlib import Path
p=Path('${REPO}/agents/user-tasks.json')
try:
  d=json.loads(p.read_text())
  tasks=d.get('tasks') if isinstance(d,dict) else d
  print(sum(1 for t in (tasks or []) if isinstance(t,dict) and t.get('status')=='open'))
except Exception:
  print(0)
" 2>/dev/null || echo 0)"
fi
interval="${QUIET_INTERVAL_SEC}"
if [[ "${open_n}" -ge "${BUSY_OPEN_TASKS}" ]]; then
  interval="${BUSY_INTERVAL_SEC}"
fi

LAST_LLM="${REPO}/agents/state/think-llm.last"
now_epoch="$(date +%s)"
if [[ -f "${LAST_LLM}" ]]; then
  last_epoch="$(date -d "$(cat "${LAST_LLM}" 2>/dev/null || true)" +%s 2>/dev/null || echo 0)"
  age=$((now_epoch - last_epoch))
  if [[ "${age}" -lt "${interval}" ]]; then
    date -Iseconds > "${REPO}/agents/state/think-tick.last"
    exit 0
  fi
fi

date -Iseconds > "${REPO}/agents/state/think-tick.last"
date -Iseconds > "${LAST_LLM}"
timeout 300 think chat -q "${PROMPT}" >/dev/null 2>&1 || true

#!/usr/bin/env bash
# Think tick: at most every 5 minutes. Writes agents/state/think-focus.json for Hub.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
LOCK="/tmp/agent-cycle-think.lock"
FOCUS="${REPO}/agents/state/think-focus.json"
LOG="${REPO}/agents/runs/think-last.log"
INTERVAL_SEC="${THINK_INTERVAL_SEC:-300}"

exec 200>"${LOCK}"
flock -n 200 || exit 0

cd "${REPO}"
mkdir -p "${REPO}/agents/state" "${REPO}/agents/runs"
date -Iseconds > "${REPO}/agents/state/think-tick.last"

focus() {
  STATUS="$1" BLURB="$2" TASK="$3" python3 - <<'PY'
import json, os
from pathlib import Path
from datetime import datetime, timezone
p = Path(os.environ.get("FOCUS_PATH", "/home/abhinav/agent-dump/agents/state/think-focus.json"))
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
status = os.environ["STATUS"]
row = {
  "status": status,
  "blurb": (os.environ.get("BLURB") or "")[:180],
  "task_id": (os.environ.get("TASK") or "")[:80],
  "updated_at": now,
}
if status == "running":
  row["started_at"] = now
else:
  try:
    prev = json.loads(p.read_text())
    if isinstance(prev, dict) and prev.get("started_at"):
      row["started_at"] = prev["started_at"]
  except Exception:
    pass
p.write_text(json.dumps(row, indent=2) + "\n")
PY
}

export FOCUS_PATH="${FOCUS}"

# No work → idle, no LLM
HAS="${REPO}/scripts/linuxbox/agent-cycle-has-work.py"
if [[ -f "${HAS}" ]]; then
  set +e
  python3 "${HAS}" --lane think --repo "${REPO}" >/dev/null
  hw=$?
  set -e
  if [[ "${hw}" -eq 1 ]]; then
    focus idle "IDLE — no open work" ""
    exit 0
  fi
fi

# Throttle
LAST="${REPO}/agents/state/think-llm.last"
now=$(date +%s)
if [[ -f "${LAST}" ]]; then
  last=$(date -d "$(cat "${LAST}")" +%s 2>/dev/null || echo 0)
  age=$((now - last))
  if [[ "${age}" -lt "${INTERVAL_SEC}" ]]; then
    focus throttled "wait ${age}s/${INTERVAL_SEC}s" ""
    exit 0
  fi
fi

# Pick one open task for Hub blurb
PICK="$(python3 - <<'PY'
import json
from pathlib import Path
fp = Path("/home/abhinav/agent-dump/agents/user-tasks.json")
try:
  d = json.loads(fp.read_text())
  tasks = [t for t in (d.get("tasks") or []) if isinstance(t, dict) and t.get("status") == "open"]
  def score(t):
    title = str(t.get("title") or "")
    body = str(t.get("body") or "")
    ops = 0 if title.startswith("[ops]") or body.startswith("## Fix this") else 1
    soon = 0 if "Urgency: soon" in body else 1
    return (ops, soon, str(t.get("created_at") or ""))
  tasks.sort(key=score)
  if not tasks:
    print("\nthink lane\n")
  else:
    t = tasks[0]
    print(str(t.get("id") or ""))
    print(str(t.get("title") or "task")[:120])
except Exception:
  print("\nthink lane\n")
PY
)"
TASK_ID="$(printf '%s\n' "${PICK}" | sed -n '1p')"
BLURB="$(printf '%s\n' "${PICK}" | sed -n '2p')"
[[ -n "${BLURB}" ]] || BLURB="think lane"

focus running "${BLURB}" "${TASK_ID}"
date -Iseconds > "${LAST}"

PROMPT="Think lane. Do ONE step for task ${TASK_ID}: ${BLURB}. Read agents/CURRENT_TASK.md and agents/user-tasks.json. No git pull. Mark task done if finished. End with DONE:/BLOCKED:/IDLE."
set +e
timeout 240 think chat -q "${PROMPT}" >"${LOG}" 2>&1
rc=$?
set -e
tail="$(tail -n 6 "${LOG}" 2>/dev/null | tr '\n' ' ' | cut -c1-160 || true)"
if [[ "${rc}" -eq 0 ]]; then
  focus done "${tail:-done}" "${TASK_ID}"
else
  focus failed "exit ${rc}: ${tail}" "${TASK_ID}"
fi

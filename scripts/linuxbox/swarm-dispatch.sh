#!/usr/bin/env bash
# Swarm MoE dispatcher — dequeue one task → route to Hermes expert profile → log result.
# Complements agent-pod-scheduler (cron pods) with explicit queue from cloud/PC/human.
#
# Usage:
#   swarm-dispatch.sh --dry-run          # show next task + expert, no LLM
#   swarm-dispatch.sh --once             # dispatch one task
#   swarm-dispatch.sh --enqueue "goal" --source smoke --expert fast
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"
REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
EXPERTS="${REPO}/agents/swarm-experts.json"
QUEUE="${REPO}/agents/swarm-queue.json"
RUNS="${REPO}/agents/state/swarm-runs.jsonl"
LOCK="/tmp/swarm-dispatch.lock"
HERMES="${HOME}/.local/bin/hermes"
MODE="once"
DRY=0
ENQUEUE_GOAL=""
ENQUEUE_SOURCE="pc"
ENQUEUE_EXPERT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --once) MODE=once; shift ;;
    --enqueue) ENQUEUE_GOAL="${2:-}"; shift 2 ;;
    --source) ENQUEUE_SOURCE="${2:-pc}"; shift 2 ;;
    --expert) ENQUEUE_EXPERT="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

exec 201>"${LOCK}"
flock -n 201 || { echo "swarm-dispatch: busy"; exit 0; }

python3 - "${REPO}" "${EXPERTS}" "${QUEUE}" "${RUNS}" "${HERMES}" "${MODE}" "${DRY}" \
  "${ENQUEUE_GOAL}" "${ENQUEUE_SOURCE}" "${ENQUEUE_EXPERT}" <<'PY'
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

repo, experts_path, queue_path, runs_path, hermes_bin, mode, dry, enq_goal, enq_src, enq_exp = sys.argv[1:11]
dry = dry == "1"
experts_doc = json.loads(Path(experts_path).read_text(encoding="utf-8"))
queue_file = Path(queue_path)
runs_file = Path(runs_path)
runs_file.parent.mkdir(parents=True, exist_ok=True)

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def load_queue():
    if queue_file.exists():
        return json.loads(queue_file.read_text(encoding="utf-8"))
    return {"tasks": []}

def save_queue(doc):
    queue_file.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")

def expert_map():
    return {e["id"]: e for e in experts_doc.get("experts", [])}

def route_expert(task):
    if task.get("expert"):
        return task["expert"]
    src = task.get("source", "")
    return experts_doc.get("routing", {}).get("by_source", {}).get(
        src, experts_doc.get("routing", {}).get("default", "ops")
    )

def append_run(entry):
    with runs_file.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

# --- enqueue mode ---
if enq_goal:
    q = load_queue()
    tid = f"task-{int(time.time())}"
    exp = enq_exp or experts_doc.get("routing", {}).get("by_source", {}).get(enq_src, "ops")
    q.setdefault("tasks", []).append({
        "id": tid,
        "status": "ready",
        "source": enq_src,
        "expert": exp,
        "goal": enq_goal,
        "priority": 50,
        "created_at": now_iso(),
    })
    save_queue(q)
    print(f"enqueued {tid} expert={exp}")
    sys.exit(0)

# --- pick next ready ---
q = load_queue()
tasks = q.get("tasks", [])
ready = [t for t in tasks if t.get("status") == "ready"]
if not ready:
    print("swarm-dispatch: IDLE (no ready tasks)")
    sys.exit(0)

ready.sort(key=lambda t: (-int(t.get("priority", 0)), t.get("created_at", "")))
task = ready[0]
exp_id = route_expert(task)
emap = expert_map()
exp = emap.get(exp_id)
if not exp:
    print(f"swarm-dispatch: unknown expert {exp_id}", file=sys.stderr)
    sys.exit(1)

profile = exp.get("profile", exp_id)
prompt = (
    f"Swarm task {task['id']} (source={task.get('source','?')}, expert={exp_id}). "
    f"Role: {exp.get('role', '')}. "
    f"Goal: {task.get('goal', '')}. "
    "Complete exactly ONE concrete step toward the goal, then stop. "
    "If blocked, reply IDLE only. "
    "Append one [LINUX] swarm line to AI_GROUPCHAT.md when done."
)

if dry:
    print(json.dumps({
        "dry_run": True,
        "task_id": task["id"],
        "expert": exp_id,
        "profile": profile,
        "pool": exp.get("pool"),
        "goal": task.get("goal"),
    }, indent=2))
    sys.exit(0)

# mark running
for t in tasks:
    if t["id"] == task["id"]:
        t["status"] = "running"
        t["started_at"] = now_iso()
        t["dispatched_expert"] = exp_id
save_queue(q)

cwd = exp.get("cwd") or repo
cmd = [hermes_bin, "-p", profile, "chat", "-q", prompt]
started = time.time()
try:
    proc = subprocess.run(
        cmd,
        cwd=cwd if Path(cwd).is_dir() else repo,
        capture_output=True,
        text=True,
        timeout=600,
    )
    rc = proc.returncode
    out = (proc.stdout or "")[:4000]
    err = (proc.stderr or "")[:2000]
except subprocess.TimeoutExpired:
    rc = -1
    out = ""
    err = "TIMEOUT"

elapsed = round(time.time() - started, 1)
idle = "IDLE" in out.upper() and rc == 0

# finalize task
q = load_queue()
for t in q.get("tasks", []):
    if t["id"] == task["id"]:
        t["status"] = "done" if rc == 0 else "failed"
        t["finished_at"] = now_iso()
        t["exit_code"] = rc
        t["idle"] = idle
        t["output_preview"] = out[:500]
save_queue(q)

append_run({
    "at": now_iso(),
    "task_id": task["id"],
    "expert": exp_id,
    "profile": profile,
    "pool": exp.get("pool"),
    "source": task.get("source"),
    "exit_code": rc,
    "idle": idle,
    "elapsed_sec": elapsed,
})

print(f"swarm-dispatch: task={task['id']} expert={exp_id} profile={profile} rc={rc} idle={idle} elapsed={elapsed}s")
if err:
    print(err, file=sys.stderr)
PY

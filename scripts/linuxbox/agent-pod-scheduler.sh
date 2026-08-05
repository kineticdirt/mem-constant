#!/usr/bin/env bash
# Agent pod scheduler — reads agents/agent-pods.manifest.json, runs one Hermes worker at a time.
# Post-run: compiled-intent gate (agents/intent/agent-loops.json).
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
MANIFEST="${REPO}/agents/agent-pods.manifest.json"
STATE="${REPO}/agents/state/pod-scheduler.json"
LOCK="/tmp/hermes-pod-scheduler.lock"
# shellcheck source=lib/archive-paths.sh
source "${REPO}/scripts/linuxbox/lib/archive-paths.sh"
LOG_DIR="${LINUXBOX_AGENT_RUNS}"
HERMES_BIN="${HOME}/.local/bin/hermes"
META_PY="${REPO}/scripts/linuxbox/archive_meta.py"
VERIFY_PY="${REPO}/scripts/linuxbox/verify_agent_intent.py"

mkdir -p "${LOG_DIR}" "$(dirname "${STATE}")"
if ! archive_logs_ready 2>/dev/null; then
  echo "WARN: /mnt/archive not ready — pod logs would use SD fallback" >&2
fi

exec 200>"${LOCK}"
flock -n 200 || exit 0

python3 - "${MANIFEST}" "${STATE}" "${REPO}" "${HERMES_BIN}" "${VERIFY_PY}" <<'PY'
import json
import hashlib
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

manifest_path, state_path, repo, hermes_bin, verify_py = sys.argv[1:6]
meta_py = Path(repo) / "scripts/linuxbox" / "archive_meta.py"
verify_py = Path(verify_py)
manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
state_file = Path(state_path)
if state_file.exists():
    state = json.loads(state_file.read_text(encoding="utf-8"))
else:
    state = {"last_run": {}, "offsets": {}}

offsets = manifest.get("scheduler_offsets_sec", {})
state.setdefault("offsets", {}).update({k: str(v) for k, v in offsets.items()})

now = time.time()
sys.path.insert(0, str(Path(repo) / "scripts" / "linuxbox"))
from resource_governor import plan_tick, write_telemetry

def maybe_cursor_offload(plan, state, now, repo, manifest, meta_py):
    """Think deferred SOLELY by the disk-swap gate while its cooldown elapsed:
    offload ONE lane item to the Cursor Auto lane, in the background (never
    blocks the tick). Conservative gates (2026-08-05, GM-approved):
    MemAvailable > 600MB and at most one dispatch per 30min (stamp file).
    cursor-agent-run.sh already forces CURSOR_SDK_AUTO_ONLY=1 (Auto only).
    Kill-switch: CURSOR_OFFLOAD=0. If RAM is tighter, stay silent — zram and
    the weekly flush are the real fix, not a heavy agent on a 2GB box.
    """
    defer = str(plan.get("defer") or "")
    if not defer.startswith("think:swap="):
        return
    if os.environ.get("CURSOR_OFFLOAD", "1") != "1":
        return
    telem = plan.get("telemetry") or {}
    if float(telem.get("avail_mb") or 0) <= 600:
        return
    try:
        cfg = json.loads((Path(repo) / "agents" / "resource-governor.json").read_text())
        cooldown = int(cfg.get("think_cooldown_sec", 480))
    except Exception:
        cooldown = 480
    last_think = float((state.get("last_run") or {}).get("think", 0) or 0)
    if last_think and (now - last_think) < cooldown:
        return
    stamp = Path(repo) / "agents" / "state" / "cursor-agent-dispatch.last"
    if stamp.is_file():
        try:
            ts = datetime.fromisoformat(
                stamp.read_text().strip().replace("Z", "+00:00")
            ).timestamp()
        except Exception:
            ts = stamp.stat().st_mtime
        if (now - ts) < 1800:
            return
    prompt = (
        "Think-lane offload (Hermes deferred by disk-swap gate; Cursor Auto lane). "
        "Workdir: agent-dump. Complete exactly ONE concrete step from the think lane: "
        "read agents/CURRENT_TASK.md and work the first lane with unchecked [ ] items "
        "(lane rotation per CLAUDE.md). If nothing actionable, reply IDLE only. "
        "Append one [LINUX] line to AI_GROUPCHAT.md when work is done."
    )
    runner = Path(repo) / "scripts" / "linuxbox" / "cursor-agent-run.sh"
    log_dir = Path(os.environ.get("LINUXBOX_AGENT_RUNS") or (Path(repo) / "agents" / "runs"))
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        nohup_log = log_dir / "cursor-agent-dispatch.log"
        with open(nohup_log, "ab") as out:
            subprocess.Popen(
                ["nohup", "bash", str(runner), prompt],
                cwd=repo,
                stdout=out,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.write_text(
            datetime.now(timezone.utc).isoformat().replace("+00:00", "Z") + chr(10)
        )
        if meta_py.is_file():
            subprocess.run(
                [
                    sys.executable, str(meta_py), "append", "agent_runs",
                    "cursor-offload", "0", str(nohup_log),
                    f"swap-gate offload: dispatched cursor-agent-run ({defer})",
                ],
                check=False,
            )
        print(f"CURSOR_OFFLOAD dispatched ({defer}; avail={telem.get('avail_mb')}MiB)")
    except OSError as e:
        print(f"CURSOR_OFFLOAD failed: {e}")

plan = plan_tick(manifest, state, now, apply_gateway_spin=True)
write_telemetry(repo, plan)
print(
    f"RESOURCE avail={plan['telemetry']['avail_mb']}MiB "
    f"swap={plan['telemetry']['swap_used_pct']}% "
    f"order={plan['candidate_order']} spin={plan['spin']}"
)
if not plan.get("chosen"):
    print(f"RESOURCE defer={plan.get('defer')}")
    maybe_cursor_offload(plan, state, now, repo, manifest, meta_py)
    sys.exit(0)

name = plan["chosen"]["name"]
pod = plan["chosen"]["pod"]
INTENT = (
    "Before editing files read agents/intent/agent-loops.json and agents/AGENT_LOOPS_INTENT.md "
    "for your pod boundary laws. Edits must pass scripts/linuxbox/verify_agent_intent.py."
)

def read_task_prompt(pod: dict) -> str:
    parts = [
        f"Pod {pod['name']} ({pod.get('pool', '?')} pool). Workdir: agent-dump.",
        INTENT,
        "Complete exactly ONE concrete step from the task spec and progress file, then stop.",
        "If nothing actionable, reply IDLE only.",
        "Append one [LINUX] line to AI_GROUPCHAT.md when work is done.",
    ]
    if pod.get("task_spec"):
        parts.append(f"Read {pod['task_spec']}.")
    if pod.get("progress"):
        parts.append(f"Progress file: {pod['progress']}.")
    if pod["name"] == "fast":
        parts = [
            "Fast pod (Qwen free). Check agents/state/human-inbox.json open+answered+inbox-seeds; ack new answers; never re-ask equivalent open/answered items; IDLE if nothing.",
            INTENT,
            "Do not git pull (deterministic apply-git-bundle + git-pull-and-deploy already ran). No RP, no dashboard coding, no campaigns/ edits.",
        ]
    elif pod["name"] == "ponytail-cleanup":
        parts = [
            "Ponytail cleanup pod (code profile). Read agents/PONYTAIL_CLEANUP_TASK.md.",
            INTENT,
            "Board: agents/PONYTAIL_CLEANUP_BOARD.md — ONE Backlog card only.",
            "Fix/refine in place; do NOT delete any files. Verify with py_compile/bash -n.",
            "Move card to Done; run sync-ponytail-board-to-usb.sh if USB mounted.",
        ]
    elif pod["name"] == "think":
        active = Path(repo) / "agents" / "meta-harness" / "active" / "think-prompt.md"
        if active.is_file():
            body = active.read_text(encoding="utf-8").strip()
            if body.startswith("#"):
                body = "\n".join(
                    ln for ln in body.splitlines() if not ln.strip().startswith("#")
                ).strip()
            if body:
                return body
    return " ".join(parts)

def write_snapshot(path: Path) -> None:
    if not verify_py.is_file():
        return
    subprocess.run(
        [sys.executable, str(verify_py), "--repo", repo, "--snapshot-out", str(path)],
        check=False,
        capture_output=True,
    )

def run_intent_gate(pod_name: str, before: Path, after: Path) -> int:
    if not verify_py.is_file() or not before.is_file() or not after.is_file():
        return 0
    proc = subprocess.run(
        [
            sys.executable,
            str(verify_py),
            "--repo",
            repo,
            "--pod",
            pod_name,
            "--before-json",
            str(before),
            "--after-json",
            str(after),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(proc.stdout, end="")
        print(proc.stderr, end="", file=sys.stderr)
    return proc.returncode

def append_env_bootstrap(prompt: str) -> tuple:
    bootstrap_sh = Path(repo) / "scripts/linuxbox" / "hermes-env-bootstrap.sh"
    if not bootstrap_sh.is_file():
        return prompt, False
    try:
        snap = subprocess.run(
            ["bash", str(bootstrap_sh)],
            cwd=repo,
            capture_output=True,
            text=True,
            timeout=20,
        )
        block = (snap.stdout or "").strip()
        if block:
            return f"{prompt}\n\n{block}", True
    except (subprocess.TimeoutExpired, OSError):
        pass
    return prompt, False

def write_meta_harness_run(
    pod_name: str,
    profile: str,
    prompt: str,
    bootstrap_used: bool,
    proc_rc: int,
    intent_rc: int,
    log_path: Path,
) -> None:
    # Shared writer with crontab think-tick (scripts/meta-harness/record_tick.py).
    mh_scripts = Path(repo) / "scripts" / "meta-harness"
    sys.path.insert(0, str(mh_scripts))
    try:
        from record_tick import record_tick as _mh_record
    except ImportError:
        return
    _mh_record(
        repo=Path(repo),
        pod=pod_name,
        profile=profile,
        exit_code=proc_rc,
        intent="INTENT_FAIL" if intent_rc != 0 else "INTENT_OK",
        log_path=str(log_path),
        prompt=prompt,
        bootstrap=bootstrap_used,
        score=True,
    )

profile = pod.get("profile") or name

# Manifest may list pods ahead of `hermes profile create` — skip gracefully
# instead of an exit-1 fail loop (tropic-gooner spam, 2026-08-05).
if not (Path.home() / ".hermes" / "profiles" / profile).is_dir():
    state.setdefault("last_run", {})[name] = now
    state.pop("current", None)
    state_file.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    if meta_py.is_file():
        subprocess.run(
            [
                sys.executable,
                str(meta_py),
                "append",
                "agent_runs",
                name,
                "0",
                "-",
                f"SKIP pod={name}: hermes profile '{profile}' not installed",
            ],
            check=False,
        )
    print(f"SKIP pod={name}: hermes profile '{profile}' not installed")
    sys.exit(0)

# Continuity seed must also fire when the pod scheduler owns the think tick
# (crontab absent/deferred) — else [ops]/backlog seeds never land and lanes idle.
seed_py = Path(repo) / "scripts/linuxbox" / "think-continuity-seed.py"
if name == "think" and seed_py.is_file():
    subprocess.run([sys.executable, str(seed_py), repo], check=False, capture_output=True)

# Deterministic IDLE short-circuit for think/fast — Hermes still runs when work exists.
has_work_py = Path(repo) / "scripts/linuxbox" / "agent-cycle-has-work.py"
if name in ("think", "fast") and has_work_py.is_file():
    hw = subprocess.run(
        [sys.executable, str(has_work_py), "--lane", name, "--repo", repo],
        capture_output=True,
        text=True,
    )
    # Exit 1 = IDLE skip LLM. Exit 0 = work. Exit 2+ = fall through (preserve function).
    if hw.returncode == 1:
        reason = (hw.stdout or hw.stderr or "IDLE").strip()
        log_path = Path(repo) / "agents" / "runs" / f"pod-{name}-idle-preflight.log"
        log_dir = os.environ.get("LINUXBOX_AGENT_RUNS")
        if log_dir:
            log_path = Path(log_dir) / log_path.name
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(f"IDLE (deterministic preflight; no LLM)\n{reason}\n", encoding="utf-8")
        state.setdefault("last_run", {})[name] = now
        state.pop("current", None)
        state_file.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        tick_stamp = Path(repo) / "agents" / "state" / f"{name}-tick.last"
        tick_stamp.parent.mkdir(parents=True, exist_ok=True)
        tick_stamp.write_text(
            datetime.now(timezone.utc).isoformat().replace("+00:00", "Z") + "\n",
            encoding="utf-8",
        )
        if meta_py.is_file():
            subprocess.run(
                [
                    sys.executable,
                    str(meta_py),
                    "append",
                    "agent_runs",
                    name,
                    "0",
                    str(log_path),
                    f"IDLE {name} preflight",
                ],
                check=False,
            )
        print(f"IDLE preflight pod={name} {reason}")
        sys.exit(0)

prompt = read_task_prompt(pod)
prompt, bootstrap_used = append_env_bootstrap(prompt)
cmd = [hermes_bin, "-p", profile, "chat", "-q", prompt]
log_path = Path(repo) / "agents" / "runs" / f"pod-{name}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.log"
log_dir = os.environ.get("LINUXBOX_AGENT_RUNS")
if log_dir:
    log_path = Path(log_dir) / log_path.name
log_path.parent.mkdir(parents=True, exist_ok=True)

snap_before = Path(f"/tmp/intent-before-{name}.json")
snap_after = Path(f"/tmp/intent-after-{name}.json")
write_snapshot(snap_before)

def first_open_checkbox(rel):
    """Return first unchecked markdown task line, shortened for UI blurb."""
    import re

    path = Path(repo) / rel
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    for line in text.splitlines():
        m = re.match(r"^\s*[-*]\s*\[\s\]\s*(.+)$", line)
        if not m:
            continue
        item = re.sub(r"\s+", " ", m.group(1)).strip()
        item = re.sub(r"\*\*([^*]+)\*\*", r"\1", item)
        return item[:140] if item else None
    return None


def first_open_user_task():
    fp = Path(repo) / "agents" / "user-tasks.json"
    if not fp.is_file():
        return None
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    tasks = data.get("tasks") if isinstance(data, dict) else data
    if not isinstance(tasks, list):
        return None
    for t in tasks:
        if not isinstance(t, dict) or t.get("status") != "open":
            continue
        title = str(t.get("title") or t.get("id") or "").strip()
        if title:
            return title[:140]
    return None


def work_blurb(pod):
    """Short human blurb for Running now — what this tick is aiming at."""
    n = pod.get("name") or "?"
    if n == "fast":
        return "fast: inbox ack / git sync"
    if n == "think":
        for rel in (
            "agents/LINUXBOX_DASHBOARD_BACKLOG.md",
            "agents/maintenance-progress.md",
            "agents/system-integrity-progress.md",
            "agents/PONYTAIL_CLEANUP_BOARD.md",
        ):
            item = first_open_checkbox(rel)
            if item:
                short = rel.rsplit("/", 1)[-1]
                return f"think → {short}: {item}"
        ut = first_open_user_task()
        if ut:
            return f"think → user-task: {ut}"
        for rel in (
            "campaigns/spacequest/reports/progress.md",
            "campaigns/nyc-mafia-dnd/reports/progress.md",
            "campaigns/tropic-gooner/reports/progress.md",
        ):
            item = first_open_checkbox(rel)
            if item:
                return f"think → {rel.split('/')[1]}: {item}"
        return "think: lane rotation / IDLE check"
    prog = pod.get("progress")
    if prog:
        item = first_open_checkbox(prog)
        if item:
            return f"{n}: {item}"
    spec = pod.get("task_spec") or ""
    if spec:
        return f"{n}: {Path(spec).name}"
    return f"{n}: scheduled tick"


def extract_done_blurb(stdout, fallback):
    """Prefer model's Concrete step / Done line for Last run blurb."""
    import re

    text = stdout or ""
    m = re.search(
        r"Concrete step:\s*(.+?)(?:\n\n|\nLedger:|\nNote:|\Z)",
        text,
        re.I | re.S,
    )
    if m:
        bit = re.sub(r"\s+", " ", m.group(1)).strip()
        if bit:
            return bit[:160]
    if re.search(r"\bIDLE\b", text):
        return f"{fallback} → IDLE"
    if "TIMEOUT" in text[:200]:
        return f"{fallback} → timeout"
    return fallback


# Live "Running now" for dashboard — cleared in finally below
blurb = work_blurb(pod)
state["current"] = {"name": name, "started_at": now, "blurb": blurb}
state_file.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
print(f"current pod={name} blurb={blurb}")

env = os.environ.copy()
cwd = pod.get("terminal_cwd") or repo
done_blurb = blurb
try:
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd if Path(cwd).is_dir() else repo,
            env=env,
            capture_output=True,
            text=True,
            timeout=600,
        )
        body = (
            f"cmd: {' '.join(cmd)}\nexit: {proc.returncode}\n\nstdout:\n{proc.stdout}\n\nstderr:\n{proc.stderr}"
        )
        proc_rc = proc.returncode
        done_blurb = extract_done_blurb(proc.stdout or "", blurb)
    except subprocess.TimeoutExpired as e:
        body = f"TIMEOUT pod={name}\n{e}"
        proc_rc = -1
        done_blurb = f"{blurb} → timeout"

    write_snapshot(snap_after)
    intent_rc = run_intent_gate(name, snap_before, snap_after)
    if intent_rc != 0:
        body += f"\n\nINTENT_FAIL pod={name} exit={intent_rc} (see agents/state/intent-violations.jsonl)\n"
        done_blurb = f"{done_blurb} (INTENT_FAIL)"
    else:
        body += f"\n\nINTENT_OK pod={name}\n"

    log_path.write_text(body, encoding="utf-8")

    write_meta_harness_run(name, profile, prompt, bootstrap_used, proc_rc, intent_rc, log_path)

    if meta_py.is_file():
        summary = (done_blurb or f"pod {name}")[:240]
        outcome = "ok" if proc_rc == 0 else ("timeout" if proc_rc == -1 else "fail")
        subprocess.run(
            [
                sys.executable,
                str(meta_py),
                "append",
                "agent_runs",
                name,
                str(proc_rc),
                str(log_path),
                summary,
                "--blurb",
                summary,
                "--outcome",
                outcome,
            ],
            cwd=repo,
            check=False,
        )

    state.setdefault("last_run", {})[name] = now
    state["last_completed"] = {
        "name": name,
        "blurb": done_blurb[:200],
        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "exit": proc_rc,
        "intent_ok": intent_rc == 0,
    }
    # Hub lane KPIs read agents/state/{fast,think}-tick.last — keep them fresh when
    # the pod scheduler owns the tick (crontab may be absent or deferred).
    if name in ("fast", "think"):
        stamp = Path(repo) / "agents" / "state" / f"{name}-tick.last"
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.write_text(
            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "\n",
            encoding="utf-8",
        )
    status = "INTENT_FAIL" if intent_rc != 0 else "ok"
    print(f"ran pod={name} log={log_path} intent={status} done={done_blurb[:80]}")
finally:
    # Merge on disk so we never wipe last_completed stamped mid-run by another writer,
    # and always clear stale current.
    try:
        disk = json.loads(state_file.read_text(encoding="utf-8")) if state_file.is_file() else {}
    except (OSError, json.JSONDecodeError):
        disk = {}
    if not isinstance(disk, dict):
        disk = {}
    disk.pop("current", None)
    if state.get("last_completed"):
        disk["last_completed"] = state["last_completed"]
    disk.setdefault("last_run", {}).update(state.get("last_run") or {})
    disk.setdefault("offsets", {}).update(state.get("offsets") or {})
    state_file.write_text(json.dumps(disk, indent=2) + "\n", encoding="utf-8")
PY

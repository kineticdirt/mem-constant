#!/usr/bin/env python3
"""Deterministic lane preflight for think/fast ticks.

Exit 0 = has actionable work (call Hermes).
Exit 1 = IDLE (no unchecked lane work / open tasks) — skip LLM, still log IDLE.
Exit 2 = usage / hard error.

Preserves function: over-detects open checkboxes rather than missing work.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Lane progress / board paths from agents/CURRENT_TASK.md rotation.
# Detection order for the WORK reason string only — picker RR (think-tick)
# treats product boards + campaign progress as the SAME tier after [ops].
# Product/campaign listed early so reason prefers them over meta when no
# open user-tasks (avoids false IDLE and dashboard-forever starvation).
THINK_MARKERS = [
    "agents/tableslop-progress.md",
    "agents/PIXI_RP_PROGRESS.md",
    "agents/portfolio-progress.md",
    "campaigns/nyc-mafia-dnd/reports/progress.md",
    "campaigns/tropic-gooner/reports/progress.md",
    "campaigns/tropic-gooner/reports/progress-hunter.md",
    "agents/LINUXBOX_DASHBOARD_BACKLOG.md",
    "agents/maintenance-progress.md",
    "agents/system-integrity-progress.md",
    "agents/PONYTAIL_CLEANUP_BOARD.md",
    "agents/security-code-audit-progress.md",
    "campaigns/spacequest/reports/progress.md",  # archived — usually empty
    "agents/nousagent-progress.md",
    # Education (human SI) then Research (studies) — quiet continuous lanes
    # after ops + project/campaign (four-lane model: campaign·project·research·education).
    "agents/self-improvement-progress.md",
    "agents/research-studies-progress.md",
]

OPEN_BOX = re.compile(r"^\s*[-*]\s*\[\s\]", re.M)


def has_open_checkbox(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    return bool(OPEN_BOX.search(text))


def has_open_user_tasks(repo: Path) -> bool:
    fp = repo / "agents" / "user-tasks.json"
    if not fp.is_file():
        return False
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    tasks = data.get("tasks") if isinstance(data, dict) else data
    if not isinstance(tasks, list):
        return False
    return any(
        isinstance(t, dict) and str(t.get("status") or "").lower() in ("open", "pending")
        for t in tasks
    )


def deepsec_enabled(repo: Path) -> bool:
    fp = repo / "agents" / "deepsec-config.json"
    if not fp.is_file():
        return False
    try:
        return bool(json.loads(fp.read_text(encoding="utf-8")).get("enabled"))
    except (OSError, json.JSONDecodeError):
        return False


def think_has_work(repo: Path) -> tuple[bool, str]:
    if has_open_user_tasks(repo):
        return True, "open user-tasks"
    for rel in THINK_MARKERS:
        if rel.endswith("security-code-audit-progress.md") and not deepsec_enabled(repo):
            continue
        if has_open_checkbox(repo / rel):
            return True, rel
    return False, "no unchecked lane work"


def load_inbox(repo: Path) -> dict:
    inbox = repo / "agents" / "state" / "human-inbox.json"
    if not inbox.is_file():
        inbox = repo / "agents" / "human-inbox.json"
    if not inbox.is_file():
        return {"open": [], "answered": []}
    try:
        raw = json.loads(inbox.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"open": [], "answered": [], "_error": True}
    if isinstance(raw, list):
        open_items = []
        answered = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            if item.get("answer") or item.get("answered_at") or item.get("status") == "answered":
                answered.append(item)
            elif item.get("status") != "answered":
                open_items.append(item)
        return {"open": open_items, "answered": answered}
    if isinstance(raw, dict):
        return {
            "open": list(raw.get("open") or []),
            "answered": list(raw.get("answered") or []),
        }
    return {"open": [], "answered": []}


def unconsumed_answer_count(repo: Path) -> int:
    consumed_path = repo / "agents" / "state" / "inbox-consumed.json"
    consumed_ids: set[str] = set()
    if consumed_path.is_file():
        try:
            data = json.loads(consumed_path.read_text(encoding="utf-8"))
            consumed_ids = set((data.get("consumed") or {}).keys())
        except (OSError, json.JSONDecodeError):
            pass
    inbox = load_inbox(repo)
    n = 0
    for item in inbox.get("answered") or []:
        if not isinstance(item, dict):
            continue
        qid = str(item.get("id") or "").strip()
        ans = str(item.get("answer") or "").strip()
        if qid and ans and qid not in consumed_ids:
            n += 1
    return n


def fast_has_work(repo: Path) -> tuple[bool, str]:
    """Fast LLM is only for inbox ack / rare blocks; swarm+git+consume are deterministic."""
    if unconsumed_answer_count(repo) > 0:
        return True, "inbox answers pending consume"
    inbox_data = load_inbox(repo)
    if inbox_data.get("_error"):
        return True, "inbox unreadable (call Hermes)"
    open_items = inbox_data.get("open") or []
    if isinstance(open_items, list) and open_items:
        for item in open_items:
            if not isinstance(item, dict):
                continue
            if item.get("answer") or item.get("answered_at") or item.get("status") == "answered":
                return True, "inbox answer pending ack"
        return False, "open inbox waiting on human"
    return False, "inbox idle"


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] != "--lane":
        print("usage: agent-cycle-has-work.py --lane think|fast [--repo PATH]", file=sys.stderr)
        return 2
    lane = sys.argv[2].strip().lower()
    repo = Path(".").resolve()
    if "--repo" in sys.argv:
        i = sys.argv.index("--repo")
        repo = Path(sys.argv[i + 1]).resolve()
    if lane == "think":
        ok, reason = think_has_work(repo)
    elif lane == "fast":
        ok, reason = fast_has_work(repo)
    else:
        print(f"unknown lane {lane!r}", file=sys.stderr)
        return 2
    print(f"{'WORK' if ok else 'IDLE'}: {reason}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

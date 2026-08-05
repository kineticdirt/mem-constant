#!/usr/bin/env python3
"""Seed testable continuity tasks so think does not go quiet when queues empty.

Runs deterministically at the start of each think tick (no LLM).

Rules (ponytail-minimal):
1. If agents/user-tasks.json has zero open tasks AND
   agents/LINUXBOX_DASHBOARD_BACKLOG.md has unchecked [ ] items → append one
   low-priority [ops] task for the first open backlog line (idempotent by title hash).
2. If no open ops-hub-playwright-smoke task was created in the last 24h → append one
   [ops] Playwright verify task (run-dashboard-ui-smoke.sh + report path).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

OPEN_BOX = re.compile(r"^\s*[-*]\s*\[\s\]\s+\*\*(.+?)\*\*", re.M)
UT_PATH = Path("agents/user-tasks.json")
BACKLOG = Path("agents/LINUXBOX_DASHBOARD_BACKLOG.md")
PW_TASK_ID = "ops-hub-playwright-smoke"
PW_COOLDOWN_H = 24


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_tasks(repo: Path) -> tuple[dict, list]:
    fp = repo / UT_PATH
    if not fp.is_file():
        return {"tasks": []}, []
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"tasks": []}, []
    tasks = data.get("tasks") if isinstance(data, dict) else data
    if not isinstance(tasks, list):
        tasks = []
        data = {"tasks": tasks}
    return data, tasks


def _save_tasks(repo: Path, data: dict) -> None:
    fp = repo / UT_PATH
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _open_tasks(tasks: list) -> list[dict]:
    # has-work and the tick picker both treat "pending" as open — the "queues
    # quiet" signal must match or the seed fires while real work exists.
    return [
        t
        for t in tasks
        if isinstance(t, dict) and str(t.get("status") or "").lower() in ("open", "pending")
    ]


def _recent_task(tasks: list, task_id: str, hours: int) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    for t in tasks:
        if not isinstance(t, dict) or str(t.get("id") or "") != task_id:
            continue
        raw = str(t.get("created_at") or t.get("updated_at") or "")
        try:
            ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            # Unparseable stamp must not suppress reseeding — the open-status
            # dedupe below still prevents duplicates.
            return False
        if ts >= cutoff:
            return True
    return False


def _first_backlog_item(repo: Path) -> str | None:
    fp = repo / BACKLOG
    if not fp.is_file():
        return None
    try:
        text = fp.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    m = OPEN_BOX.search(text)
    if not m:
        # Fallback: any open checkbox line
        for line in text.splitlines():
            if re.match(r"^\s*[-*]\s*\[\s\]", line):
                return re.sub(r"^\s*[-*]\s*\[\s\]\s*", "", line).strip()[:120]
        return None
    return m.group(1).strip()


def _backlog_task_id(title: str) -> str:
    h = hashlib.sha1(title.encode("utf-8")).hexdigest()[:10]
    return f"hub-backlog-{h}"


def seed(repo: Path) -> list[str]:
    data, tasks = _load_tasks(repo)
    seeded: list[str] = []
    open_t = _open_tasks(tasks)

    if not open_t:
        item = _first_backlog_item(repo)
        if item:
            tid = _backlog_task_id(item)
            if not any(str(t.get("id")) == tid for t in tasks):
                tasks.append(
                    {
                        "id": tid,
                        "title": f"[ops] Hub backlog: {item[:80]}",
                        "body": (
                            f"Implement one item from agents/LINUXBOX_DASHBOARD_BACKLOG.md:\n"
                            f"- {item}\n\n"
                            "Verify: curl 127.0.0.1:8790 for API; C6 Playwright "
                            "bash scripts/linuxbox/run-dashboard-ui-smoke.sh for UI."
                        ),
                        "status": "open",
                        "project_id": "linuxbox",
                        "tags": ["ops", "hub", "backlog-seed"],
                        "priority": "low",
                        "created_at": _now(),
                        "updated_at": _now(),
                    }
                )
                seeded.append(tid)

    if not _recent_task(tasks, PW_TASK_ID, PW_COOLDOWN_H):
        if not any(
            str(t.get("id")) == PW_TASK_ID and str(t.get("status")) == "open"
            for t in tasks
        ):
            tasks.append(
                {
                    "id": PW_TASK_ID,
                    "title": "[ops] Hub Playwright smoke verify",
                    "body": (
                        "Run bash scripts/linuxbox/run-dashboard-ui-smoke.sh on potato. "
                        "Confirm reports/dashboard-ui-smoke/latest.json exists and "
                        "exit 0. Fix any FAIL before marking done."
                    ),
                    "status": "open",
                    "project_id": "linuxbox",
                    "tags": ["ops", "verify", "playwright"],
                    "priority": "medium",
                    "created_at": _now(),
                    "updated_at": _now(),
                }
            )
            seeded.append(PW_TASK_ID)

    if seeded:
        data["tasks"] = tasks
        _save_tasks(repo, data)
    return seeded


def _self_check() -> int:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        (repo / "agents").mkdir(parents=True)
        (repo / BACKLOG).write_text("- [ ] **Fix the Hub thing**\n", encoding="utf-8")

        # 1) pending counts as open → backlog seed must NOT fire
        _save_tasks(repo, {"tasks": [{"id": "t-pending", "status": "pending"}]})
        added = seed(repo)
        assert PW_TASK_ID in added, added
        assert not any(a.startswith("hub-backlog-") for a in added), added

        # 2) zero open + backlog [ ] → seeds one backlog task; rerun idempotent
        _save_tasks(repo, {"tasks": []})
        added = seed(repo)
        assert any(a.startswith("hub-backlog-") for a in added), added
        assert seed(repo) == [], "backlog seed not idempotent"

        # 3) corrupt timestamp on a closed PW task must not suppress reseed
        _save_tasks(
            repo,
            {"tasks": [{"id": PW_TASK_ID, "status": "done", "created_at": "not-a-date"}]},
        )
        added = seed(repo)
        assert PW_TASK_ID in added, added
    print("think-continuity-seed self_check OK")
    return 0


def main() -> int:
    if "--self-check" in sys.argv:
        return _self_check()
    repo = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "agent-dump"
    added = seed(repo)
    for tid in added:
        print(f"seeded:{tid}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

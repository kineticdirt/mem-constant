#!/usr/bin/env python3
"""think-tick soft-close — evidence gates, then close via user-tasks-store (door+ledger).

Replaces inline heredoc writers in agent-cycle-think-tick.sh (audit: dedupe + guard).
Each soft-close still requires its live evidence; write goes through ONE path.

Usage:
  python3 scripts/linuxbox/think-soft-close.py --task pf-blog-01
  python3 scripts/linuxbox/think-soft-close.py --all
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Optional

REPO = Path("/home/abhinav/agent-dump")


def _store():
    p = Path(__file__).with_name("user-tasks-store.py")
    spec = importlib.util.spec_from_file_location("user_tasks_store", p)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def _utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def ev_pf_blog_01(repo: Path) -> Optional[str]:
    exp = repo / ".staging/portfolio-redesign/v8-brutalist-map/experience.html"
    css = repo / ".staging/portfolio-redesign/v8-brutalist-map/styles.css"
    smoke = repo / "reports/portfolio-smoke/LATEST.md"
    has_strip = "timeline-strip" in _read(exp) and "timeline-strip" in _read(css)
    smoke_ok = "PASS" in _read(smoke)
    if has_strip and smoke_ok:
        return f"think-soft-close:timeline-strip+portfolio-smoke PASS ({_utc()})"
    return None


def ev_lb_01(repo: Path) -> Optional[str]:
    led = _read(repo / "AI_GROUPCHAT.md")
    machines_js = _read(repo / "scripts/linuxbox/linuxbox-status-server.js")
    if "OPEN CHANNEL" in led and "Machines" in led and "/api/machines" in machines_js:
        return f"think-soft-close: OPEN CHANNEL + /api/machines shipped ({_utc()})"
    return None


def ev_lb_02(repo: Path) -> Optional[str]:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8790/api/machines", timeout=3) as r:
            if int(getattr(r, "status", 200) or 200) >= 400:
                return None
    except Exception:
        return None
    return f"think-soft-close: /api/machines live ({_utc()})"


GATES: Dict[str, Callable[[Path], Optional[str]]] = {
    "pf-blog-01": ev_pf_blog_01,
    "lb-01-laptop-connected": ev_lb_01,
    "lb-02-multi-machine-sync": ev_lb_02,
}


def close_if_ready(repo: Path, task_id: str) -> bool:
    gate = GATES.get(task_id)
    if gate is None:
        return False
    note = gate(repo)
    if not note:
        return False
    fp = repo / "agents" / "user-tasks.json"
    if not fp.is_file():
        return False
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    task = None
    for t in data.get("tasks") or []:
        if isinstance(t, dict) and str(t.get("id") or "") == task_id:
            task = t
            break
    if task is None:
        return False
    if str(task.get("status") or "").lower() not in ("open", "in_progress", "running", ""):
        return False
    r = _store().set_task_status(repo, task_id, "done", note=note)
    if r.get("ok") and r.get("changed"):
        print(f"think-soft-close: {task_id} -> done", flush=True)
        return True
    if not r.get("ok"):
        print(f"think-soft-close HOLD:{task_id} {r.get('errors')}", file=sys.stderr, flush=True)
    return False


def self_check() -> int:
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="tsc-"))
    (tmp / "agents").mkdir(parents=True, exist_ok=True)
    (tmp / ".staging/portfolio-redesign/v8-brutalist-map").mkdir(parents=True, exist_ok=True)
    (tmp / "reports/portfolio-smoke").mkdir(parents=True, exist_ok=True)
    (tmp / "agents" / "user-tasks.json").write_text(
        json.dumps(
            {"version": 2, "projects": [], "tasks": [{"id": "pf-blog-01", "status": "open"}]}
        ),
        encoding="utf-8",
    )
    assert not close_if_ready(tmp, "pf-blog-01"), "should not close without evidence"
    (tmp / ".staging/portfolio-redesign/v8-brutalist-map/experience.html").write_text(
        "timeline-strip", encoding="utf-8"
    )
    (tmp / ".staging/portfolio-redesign/v8-brutalist-map/styles.css").write_text(
        ".timeline-strip{}", encoding="utf-8"
    )
    (tmp / "reports/portfolio-smoke/LATEST.md").write_text("PASS", encoding="utf-8")
    assert close_if_ready(tmp, "pf-blog-01"), "evidence present should close"
    data = json.loads((tmp / "agents" / "user-tasks.json").read_text(encoding="utf-8"))
    assert data["tasks"][0]["status"] == "done", data
    assert not close_if_ready(tmp, "pf-blog-01"), "idempotent"
    print("think-soft-close self-check PASS")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--task", choices=sorted(GATES.keys()))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--repo", default=str(REPO))
    args = ap.parse_args()
    if args.self_check:
        return self_check()
    repo = Path(args.repo)
    if args.all:
        for tid in GATES:
            close_if_ready(repo, tid)
        return 0
    if args.task:
        return 0 if close_if_ready(repo, args.task) else 1
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())

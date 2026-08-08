#!/usr/bin/env python3
"""Single store for agents/user-tasks.json — door + ledger around every status change.

Why: audit found 6+ writers with divergent status vocabularies (blocked dropped,
deferred invented). One helper keeps writes on the ontology enums.

Usage:
  python3 scripts/linuxbox/user-tasks-store.py --self-check
  python3 scripts/linuxbox/user-tasks-store.py close --id TASK_ID --note "..." [--repo DIR]
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

REPO = Path(__file__).resolve().parents[2]
TASKS_REL = Path("agents") / "user-tasks.json"


def _load_validator(name: str):
    import importlib.util

    p = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(name.replace("-", "_").split(".")[0], p)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


_door = None
_ledger = None


def door_validate(spec: str, payload: Dict[str, Any]) -> list:
    global _door
    if _door is None:
        _door = _load_validator("door-validate.py")
    return _door.validate_payload(spec, payload)


def ledger_validate(task: dict, prior_status: Optional[str]) -> list:
    global _ledger
    if _ledger is None:
        _ledger = _load_validator("ontology-ledger-check.py")
    return _ledger.validate_task(task, prior_status=prior_status)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_store(repo: Path) -> Dict[str, Any]:
    fp = repo / TASKS_REL
    if not fp.is_file():
        return {"version": 2, "projects": [], "tasks": []}
    return json.loads(fp.read_text(encoding="utf-8"))


def save_store(repo: Path, data: Dict[str, Any]) -> None:
    fp = repo / TASKS_REL
    fp.parent.mkdir(parents=True, exist_ok=True)
    if fp.is_file():
        shutil.copy2(fp, fp.with_suffix(".json.bak"))
    fp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def find_task(data: Dict[str, Any], task_id: str) -> Optional[Dict[str, Any]]:
    for t in data.get("tasks") or []:
        if isinstance(t, dict) and t.get("id") == task_id:
            return t
    return None


def set_task_status(
    repo: Path,
    task_id: str,
    status: str,
    *,
    note: Optional[str] = None,
    allow_same: bool = True,
) -> Dict[str, Any]:
    """Door (shape) + ledger (transition) then write. Returns result dict."""
    status = str(status).lower().strip()
    door_errs = door_validate(
        "user_task_status_patch",
        {"id": task_id, "status": status, "agent_note": note or ""},
    )
    if door_errs:
        return {"ok": False, "where": "door", "errors": door_errs}

    data = load_store(repo)
    task = find_task(data, task_id)
    if task is None:
        return {"ok": False, "where": "lookup", "errors": [f"NO_TASK:{task_id}"]}

    prior = str(task.get("status") or "open").lower().strip()
    prior = {"pending": "open", "running": "in_progress", "": "open"}.get(prior, prior)
    if prior == status and allow_same:
        return {"ok": True, "changed": False, "task": task}

    trial = dict(task)
    trial["status"] = status
    led_errs = ledger_validate(trial, prior_status=prior)
    if led_errs:
        return {"ok": False, "where": "ledger", "errors": led_errs, "prior": prior}

    task["status"] = status
    task["updated_at"] = _utc_now()
    if note:
        body = str(task.get("body") or "")
        line = f"{_utc_now()}: {note[:400]}"
        if line not in body:
            task["body"] = (body.rstrip() + "\n\n" + line).strip()
    save_store(repo, data)
    return {"ok": True, "changed": True, "task": task, "prior": prior}


def self_check() -> int:
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="uts-"))
    (tmp / "agents").mkdir(parents=True, exist_ok=True)
    (tmp / TASKS_REL).write_text(
        json.dumps(
            {
                "version": 2,
                "projects": [],
                "tasks": [{"id": "t-one", "title": "x", "status": "open"}],
            }
        ),
        encoding="utf-8",
    )
    r = set_task_status(tmp, "t-one", "done", note="self")
    assert r["ok"] and r["changed"], r
    r2 = set_task_status(tmp, "t-one", "open")
    assert not r2["ok"] and r2["where"] == "ledger", r2
    r3 = set_task_status(tmp, "t-one", "bogus")
    assert not r3["ok"] and r3["where"] == "door", r3
    print("user-tasks-store self-check PASS")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--repo", default=str(REPO))
    sub = ap.add_subparsers(dest="cmd")
    c = sub.add_parser("close", help="mark task done (open/in_progress → done)")
    c.add_argument("--id", required=True)
    c.add_argument("--note", default="closed via user-tasks-store")
    args = ap.parse_args()
    if args.self_check:
        return self_check()
    if args.cmd == "close":
        r = set_task_status(Path(args.repo), args.id, "done", note=args.note)
        if not r["ok"]:
            for e in r.get("errors", []):
                print(f"HOLD:{r['where']} {e}", file=sys.stderr)
            return 1
        print("OK:done" if r.get("changed") else "OK:no-change")
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())

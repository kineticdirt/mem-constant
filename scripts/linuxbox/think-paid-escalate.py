#!/usr/bin/env python3
"""C8 scenario-2 bookkeeping: verified free failures before one paid attempt.

State: agents/state/think-paid-escalate.json
Commands: check | record-fail | clear | mark-paid | work-open
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def state_path(repo: Path) -> Path:
    return repo / "agents/state/think-paid-escalate.json"


def load_state(repo: Path) -> dict:
    p = state_path(repo)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("tasks", {})
            return data
    except Exception:
        pass
    return {"tasks": {}}


def save_state(repo: Path, data: dict) -> None:
    p = state_path(repo)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def make_key(task_id: str, lane_file: str, lane_item: str) -> str:
    tid = (task_id or "").strip()
    lf = (lane_file or "").strip().replace("\\", "/")
    li = re.sub(r"\s+", " ", (lane_item or "").strip())[:160]
    if lf and li:
        return f"lane:{lf}::{li}"
    if tid:
        return f"task:{tid}"
    return ""


def work_still_open(repo: Path, task_id: str, lane_file: str, lane_item: str) -> bool:
    """Concrete verify: user-task still open, or lane checkbox still unchecked."""
    lf = (lane_file or "").strip().replace("\\", "/")
    li = (lane_item or "").strip()
    tid = (task_id or "").strip()

    if lf and li:
        path = repo / lf
        if not path.is_file():
            return True
        text = path.read_text(encoding="utf-8", errors="replace")
        # Open box matching the item text (first 80 chars of body after `- [ ]`).
        needle = li[:80]
        for line in text.splitlines():
            m = re.match(r"^(\s*)[-*]\s+\[ \]\s+(.*)$", line)
            if not m:
                continue
            body = m.group(2).strip()
            if body == li or body.startswith(needle) or li.startswith(body[:80]):
                return True
        return False

    if tid and not tid.startswith("lane:"):
        ut = repo / "agents/user-tasks.json"
        try:
            data = json.loads(ut.read_text(encoding="utf-8"))
        except Exception:
            return True
        tasks = data.get("tasks") if isinstance(data, dict) else data
        if not isinstance(tasks, list):
            return True
        for t in tasks:
            if not isinstance(t, dict):
                continue
            if str(t.get("id") or "") != tid:
                continue
            return str(t.get("status") or "open").lower() in ("open", "in_progress", "running", "")
        return True

    # No explicit metric → do not escalate (scenario 2 requires a metric).
    return False


def has_success_metric(task_id: str, lane_file: str, lane_item: str) -> bool:
    if (lane_file or "").strip() and (lane_item or "").strip():
        return True
    tid = (task_id or "").strip()
    return bool(tid) and not tid.startswith("lane:")


def cmd_check(args: argparse.Namespace) -> int:
    repo = Path(args.repo)
    key = args.key or make_key(args.task_id, args.lane_file, args.lane_item)
    n = int(args.n or 2)
    if not key or not has_success_metric(args.task_id, args.lane_file, args.lane_item):
        print("NO_METRIC")
        print("0")
        print("")
        return 0
    st = load_state(repo)
    rec = st.get("tasks", {}).get(key) or {}
    fails = int(rec.get("free_verify_fails") or 0)
    paid_used = bool(rec.get("paid_used"))
    metric = str(rec.get("success_metric") or args.metric or "")
    # One paid shot per fail streak; if already used, stay on free until cleared.
    if paid_used:
        print("PAID_USED")
        print(str(fails))
        print(metric)
        return 0
    if fails >= n:
        print("READY")
        print(str(fails))
        print(metric)
        return 0
    print("WAIT")
    print(str(fails))
    print(metric)
    return 0


def cmd_record_fail(args: argparse.Namespace) -> int:
    repo = Path(args.repo)
    key = args.key or make_key(args.task_id, args.lane_file, args.lane_item)
    if not key or not has_success_metric(args.task_id, args.lane_file, args.lane_item):
        print("SKIP_NO_METRIC")
        return 0
    st = load_state(repo)
    rec = st.setdefault("tasks", {}).setdefault(key, {})
    rec["free_verify_fails"] = int(rec.get("free_verify_fails") or 0) + 1
    rec["success_metric"] = (args.metric or rec.get("success_metric") or "").strip() or (
        f"lane checkbox closed: {args.lane_item}" if args.lane_item else f"user-task {args.task_id} status=done|blocked"
    )
    rec["verify_kind"] = (args.verify_kind or rec.get("verify_kind") or "harness_work_open").strip()
    rec["last_fail_at"] = now_iso()
    rec["last_model"] = (args.model or "").strip()
    rec["paid_used"] = False
    save_state(repo, st)
    print(rec["free_verify_fails"])
    print(rec["success_metric"])
    return 0


def cmd_clear(args: argparse.Namespace) -> int:
    repo = Path(args.repo)
    key = args.key or make_key(args.task_id, args.lane_file, args.lane_item)
    if not key:
        print("0")
        return 0
    st = load_state(repo)
    tasks = st.setdefault("tasks", {})
    if key in tasks:
        del tasks[key]
        save_state(repo, st)
    print("CLEARED")
    return 0


def cmd_mark_paid(args: argparse.Namespace) -> int:
    repo = Path(args.repo)
    key = args.key or make_key(args.task_id, args.lane_file, args.lane_item)
    if not key:
        print("NO_KEY")
        return 0
    st = load_state(repo)
    rec = st.setdefault("tasks", {}).setdefault(key, {})
    rec["paid_used"] = True
    rec["paid_at"] = now_iso()
    rec["paid_scenario"] = (args.scenario or "verified_fail").strip()
    rec["paid_model"] = (args.model or "").strip()
    rec["success_metric"] = (args.metric or rec.get("success_metric") or "").strip()
    rec["free_verify_fails"] = int(rec.get("free_verify_fails") or 0)
    save_state(repo, st)
    print(
        f"PAID scenario={rec['paid_scenario']} fails={rec['free_verify_fails']} "
        f"metric={rec.get('success_metric')} model={rec.get('paid_model')}"
    )
    return 0


def cmd_work_open(args: argparse.Namespace) -> int:
    repo = Path(args.repo)
    open_ = work_still_open(repo, args.task_id, args.lane_file, args.lane_item)
    print("OPEN" if open_ else "CLOSED")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add_work_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--repo", default=".")
        p.add_argument("--key", default="")
        p.add_argument("--task-id", default="")
        p.add_argument("--lane-file", default="")
        p.add_argument("--lane-item", default="")
        p.add_argument("--metric", default="")
        p.add_argument("--model", default="")
        p.add_argument("--verify-kind", default="")
        p.add_argument("--scenario", default="")
        p.add_argument("--n", default="2")

    for name in ("check", "record-fail", "clear", "mark-paid", "work-open"):
        p = sub.add_parser(name)
        add_work_args(p)

    args = ap.parse_args()
    if args.cmd == "check":
        return cmd_check(args)
    if args.cmd == "record-fail":
        return cmd_record_fail(args)
    if args.cmd == "clear":
        return cmd_clear(args)
    if args.cmd == "mark-paid":
        return cmd_mark_paid(args)
    if args.cmd == "work-open":
        return cmd_work_open(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

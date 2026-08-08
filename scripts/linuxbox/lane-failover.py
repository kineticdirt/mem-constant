#!/usr/bin/env python3
"""Cross-lane failure handoff + archive for open user-tasks.

When one lane (think/hermes | cursor) fails a task N times, hand it to the other
lane via context.assigned_lane (hermes|cursor — matches pickers). If BOTH lanes
have failed the same task N times each, archive it for the human (status=blocked
+ assigned_lane=archived) instead of thrashing. Body/notes stay in user-tasks.json.

Commands:
  lane-failover.py record --repo R --lane think|hermes|cursor --task-id ID [--n N]
  lane-failover.py after-run --repo R --lane … --task-id ID [--exit-code N] [--n N]
      Closed → clear. exit!=0 and still open → record. exit 0 + still open → no-op
      (multi-packet progress must not false-handoff).
  lane-failover.py clear  --repo R --task-id ID
  lane-failover.py self-check

State: agents/state/lane-failover.json (potato runtime, gitignored).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE = Path("agents/state/lane-failover.json")
# Internal fail keys (stable). assigned_lane uses hermes|cursor for pickers.
LANE_CANON = {"think": "think", "hermes": "think", "cursor": "cursor"}
DEFAULT_N = 2


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _canon(lane: str) -> str | None:
    return LANE_CANON.get((lane or "").strip().lower())


def _assigned_for(canon: str) -> str:
    """Picker-facing assigned_lane value."""
    return "hermes" if canon == "think" else "cursor"


def _load_state(repo: Path) -> dict:
    fp = repo / STATE
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("tasks", {})
            return data
    except Exception:
        pass
    return {"version": 1, "tasks": {}}


def _save_state(repo: Path, data: dict) -> None:
    fp = repo / STATE
    fp.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = _now()
    fp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _load_ut(repo: Path) -> tuple[dict | None, list | None]:
    fp = repo / "agents" / "user-tasks.json"
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except Exception:
        return None, None
    tasks = data.get("tasks") if isinstance(data, dict) else None
    if not isinstance(tasks, list):
        return data if isinstance(data, dict) else None, None
    return data, tasks


def _find_task(repo: Path, task_id: str) -> dict | None:
    data, tasks = _load_ut(repo)
    if not tasks:
        return None
    for t in tasks:
        if isinstance(t, dict) and str(t.get("id") or "") == task_id:
            return t
    return None


def _save_task(repo: Path, task: dict) -> None:
    data, tasks = _load_ut(repo)
    if not data or not tasks:
        return
    for i, t in enumerate(tasks):
        if isinstance(t, dict) and str(t.get("id") or "") == str(task.get("id") or ""):
            tasks[i] = task
            break
    data["updated_at"] = _now()
    (repo / "agents" / "user-tasks.json").write_text(
        json.dumps(data, indent=2) + "\n", encoding="utf-8"
    )


def _other(canon: str) -> str:
    return "cursor" if canon == "think" else "think"


def _archive_meta(repo: Path, task_id: str, title: str, fails: dict) -> None:
    """Best-effort: leave a durable archive breadcrumb (no delete)."""
    try:
        sys.path.insert(0, str(repo / "scripts" / "linuxbox"))
        from archive_meta import append_run  # type: ignore

        append_run(
            "lane_failover",
            f"archived-{task_id[:12]}",
            1,
            str(repo / STATE),
            summary=f"both lanes failed — {title[:120]}",
            task_id=task_id,
            blurb=title[:200],
            outcome="archived",
            detail=f"think={fails.get('think',0)} cursor={fails.get('cursor',0)}",
        )
    except Exception:
        # Fallback: append one line under agents/state/lane-failover-archive.jsonl
        arc = repo / "agents" / "state" / "lane-failover-archive.jsonl"
        try:
            arc.parent.mkdir(parents=True, exist_ok=True)
            with arc.open("a", encoding="utf-8") as f:
                f.write(
                    json.dumps(
                        {
                            "ts": _now(),
                            "task_id": task_id,
                            "title": title[:200],
                            "fails": fails,
                        }
                    )
                    + "\n"
                )
        except OSError:
            pass


def _door_check_record(task_id: str, lane: str, n: int, exit_code: int | None = None) -> bool:
    """Pydantic-at-the-door (Coyle): validate CLI-ish args before state/task mutation."""
    import importlib.util

    _p = Path(__file__).with_name("door-validate.py")
    if not _p.exists():
        return True
    _spec = importlib.util.spec_from_file_location("door_validate", _p)
    _mod = importlib.util.module_from_spec(_spec)
    assert _spec and _spec.loader
    _spec.loader.exec_module(_mod)
    payload: dict = {"task_id": task_id, "lane": lane, "n": n}
    if exit_code is not None:
        payload["exit_code"] = int(exit_code)
    errs = _mod.validate_payload("lane_failover_record", payload)
    if errs:
        print("DOOR_HOLD:lane_failover_record " + "; ".join(errs), file=sys.stderr)
        return False
    return True


def cmd_record(repo: Path, task_id: str, lane: str, n: int) -> int:
    if not _door_check_record(task_id, lane, n):
        return 2
    canon = _canon(lane)
    if not canon:
        print(f"ERROR: --lane must be one of think|hermes|cursor", file=sys.stderr)
        return 2
    task = _find_task(repo, task_id)
    if task is None:
        print(f"NO_TASK:{task_id}")
        return 0
    st = str(task.get("status") or "open").lower()
    if st not in ("open", "pending", "in_progress", "running", ""):
        return 0

    state = _load_state(repo)
    rec = state["tasks"].setdefault(task_id, {"fails": {}, "archived": False})
    fails = rec.setdefault("fails", {})
    fails[canon] = int(fails.get(canon, 0)) + 1
    rec["last_fail"] = {"lane": canon, "at": _now(), "count": fails[canon]}

    ctx = task.setdefault("context", {})
    if not isinstance(ctx, dict):
        ctx = {}
        task["context"] = ctx

    if fails[canon] >= n:
        other = _other(canon)
        if int(fails.get(other, 0)) >= n:
            title = str(task.get("title") or task_id)
            prior = st
            task["status"] = "blocked"
            task["updated_at"] = _now()
            prev_note = str(task.get("agent_note") or "")
            reason = (
                "Both lanes failed "
                f"(think={fails.get('think', 0)}×, cursor={fails.get('cursor', 0)}×) — "
                "archived for human review via lane-failover."
            )
            task["agent_note"] = (prev_note + "\n" + reason).strip()
            ctx["assigned_lane"] = "archived"
            # Ontology at the ledger (Coyle) — refuse illegal archive shape.
            try:
                from ontology_ledger_check import validate_task as _ont_validate  # type: ignore
            except ImportError:
                import importlib.util

                _p = Path(__file__).with_name("ontology-ledger-check.py")
                _spec = importlib.util.spec_from_file_location("ontology_ledger_check", _p)
                _mod = importlib.util.module_from_spec(_spec)
                assert _spec and _spec.loader
                _spec.loader.exec_module(_mod)
                _ont_validate = _mod.validate_task
            _viol = _ont_validate(task, prior_status=prior)
            if _viol:
                print(f"LEDGER_HOLD:{task_id} " + "; ".join(_viol), file=sys.stderr)
                return 1
            rec["archived"] = True
            rec["archived_at"] = _now()
            _save_task(repo, task)
            _save_state(repo, state)
            _archive_meta(repo, task_id, title, fails)
            print(f"ARCHIVED:{task_id} other_lane_failed={other} n={n}")
            return 0
        # Only this lane failed → hand to the other (picker-facing name).
        ctx["assigned_lane"] = _assigned_for(other)
        task["updated_at"] = _now()
        # Ledger door on handoff: keep shape (lane enum) honest; status unchanged.
        try:
            _lv = _ont_validate(task, prior_status=st)  # type: ignore[name-defined]
        except NameError:
            import importlib.util

            _p = Path(__file__).with_name("ontology-ledger-check.py")
            _spec = importlib.util.spec_from_file_location("ontology_ledger_check", _p)
            _mod = importlib.util.module_from_spec(_spec)
            assert _spec and _spec.loader
            _spec.loader.exec_module(_mod)
            _lv = _mod.validate_task(task, prior_status=st)
        if _lv:
            print(f"LEDGER_HOLD:{task_id} " + "; ".join(_lv), file=sys.stderr)
            return 1
        rec["handed_to"] = other
        rec["handoff_at"] = _now()
        _save_task(repo, task)
        _save_state(repo, state)
        print(
            f"HANDOFF:{task_id} {canon}->{other} "
            f"assigned_lane={_assigned_for(other)} n={n}"
        )
        return 0

    _save_state(repo, state)
    print(f"RECORD:{task_id} {canon}_fails={fails[canon]} n={n}")
    return 0


def cmd_after_run(
    repo: Path, task_id: str, lane: str, n: int, exit_code: int | None = None
) -> int:
    """Post-tick hook: closed → clear; failed+open → record; ok+open → no-op."""
    if not task_id:
        print("NO_TASK_ID")
        return 0
    task = _find_task(repo, task_id)
    if task is None:
        print(f"NO_TASK:{task_id}")
        return 0
    st = str(task.get("status") or "open").lower()
    if st in ("done", "blocked", "deferred", "closed"):
        return cmd_clear(repo, task_id)
    # Still open: only count a lane fail when the tick actually failed.
    # exit 0 + open = multi-packet progress (do not false-handoff).
    if exit_code is None or int(exit_code) == 0:
        print(f"NOOP:{task_id} still_open exit={exit_code}")
        return 0
    if int(exit_code) == 429:
        print(f"NOOP:{task_id} free_429")
        return 0
    return cmd_record(repo, task_id, lane, n)


def cmd_clear(repo: Path, task_id: str) -> int:
    state = _load_state(repo)
    if task_id in state["tasks"]:
        del state["tasks"][task_id]
        _save_state(repo, state)
        print(f"CLEARED:{task_id}")
    else:
        print(f"NONE:{task_id}")
    return 0


def cmd_self_check() -> int:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        (repo / "agents" / "state").mkdir(parents=True)
        task = {
            "id": "t1",
            "title": "[ops] test",
            "body": "## Fix this\nSymptom / repro",
            "status": "open",
            "context": {},
        }
        (repo / "agents").mkdir(parents=True, exist_ok=True)
        ut = repo / "agents" / "user-tasks.json"
        ut.write_text(json.dumps({"tasks": [task]}, indent=2) + "\n", encoding="utf-8")

        # hermes alias → think key; first fail = RECORD
        assert cmd_record(repo, "t1", "hermes", 2) == 0
        assert json.loads(ut.read_text())["tasks"][0]["context"] == {}
        st = json.loads((repo / STATE).read_text())
        assert st["tasks"]["t1"]["fails"]["think"] == 1

        # second think fail → HANDOFF to cursor (assigned_lane=cursor)
        cmd_record(repo, "t1", "think", 2)
        t = json.loads(ut.read_text())["tasks"][0]
        assert t["context"].get("assigned_lane") == "cursor", t["context"]
        assert t["status"] == "open"

        # cursor fails twice → ARCHIVED (both lanes); assigned_lane=archived
        cmd_record(repo, "t1", "cursor", 2)
        cmd_record(repo, "t1", "cursor", 2)
        t = json.loads(ut.read_text())["tasks"][0]
        assert t["status"] == "blocked", t["status"]
        assert t["context"]["assigned_lane"] == "archived"
        assert "Both lanes failed" in t["agent_note"]

        # after-run on blocked → clear
        cmd_after_run(repo, "t1", "cursor", 2, exit_code=0)
        assert "t1" not in json.loads((repo / STATE).read_text())["tasks"]

        # after-run open + exit 0 → NOOP (multi-packet)
        t["status"] = "open"
        t["context"] = {}
        t["agent_note"] = ""
        _save_task(repo, t)
        cmd_after_run(repo, "t1", "cursor", 2, exit_code=0)
        assert "t1" not in _load_state(repo)["tasks"]

        # after-run open + exit 1 → record
        cmd_after_run(repo, "t1", "cursor", 2, exit_code=1)
        st = json.loads((repo / STATE).read_text())
        assert st["tasks"]["t1"]["fails"]["cursor"] == 1

        cmd_clear(repo, "t1")
        assert "t1" not in json.loads((repo / STATE).read_text())["tasks"]

    print("SELF-CHECK PASS")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=("record", "after-run", "clear", "self-check"))
    ap.add_argument("--repo", default=".", type=Path)
    ap.add_argument("--task-id", default="")
    ap.add_argument("--lane", default="")
    ap.add_argument("--n", default=str(DEFAULT_N), type=int)
    ap.add_argument("--exit-code", default=None, type=int)
    args = ap.parse_args()
    repo = args.repo.resolve()
    if args.cmd == "record":
        return cmd_record(repo, args.task_id, args.lane, args.n)
    if args.cmd == "after-run":
        return cmd_after_run(
            repo, args.task_id, args.lane, args.n, exit_code=args.exit_code
        )
    if args.cmd == "clear":
        return cmd_clear(repo, args.task_id)
    if args.cmd == "self-check":
        return cmd_self_check()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

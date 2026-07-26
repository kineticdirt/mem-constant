#!/usr/bin/env python3
"""Score a meta-harness pod tick from run JSON (+ optional log). Stdlib only."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_TASKS_PATH = REPO_ROOT / "agents" / "meta-harness" / "eval-tasks.json"
RUNS_DIR = REPO_ROOT / "agents" / "meta-harness" / "runs"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_log_tail(log_path: Path | None, nbytes: int = 8192) -> str:
    if not log_path or not log_path.is_file():
        return ""
    with log_path.open("rb") as fh:
        fh.seek(0, 2)
        size = fh.tell()
        fh.seek(max(0, size - nbytes))
        return fh.read().decode("utf-8", errors="replace")


def detect_outcome(run: dict, log_text: str) -> str:
    if run.get("intent") != "INTENT_OK":
        return "intent_fail"
    if re.search(r"\bIDLE\b", log_text, re.IGNORECASE):
        return "idle"
    if re.search(r"\[x\]|marked done|advanced|completed", log_text, re.IGNORECASE):
        return "advance"
    return "intent_ok"


def match_task(run: dict, tasks: list[dict], log_text: str) -> dict | None:
    pod = run.get("pod", "")
    pool = [t for t in tasks if t.get("pod") == pod]
    if not pool:
        return None

    if run.get("eval_task_id"):
        for task in pool:
            if task.get("id") == run["eval_task_id"]:
                return task

    for task in pool:
        pattern = task.get("task_line_pattern")
        if not pattern:
            continue
        if re.search(pattern, log_text, re.IGNORECASE):
            return task
        progress = task.get("progress_file")
        if progress:
            pf = REPO_ROOT / progress
            if pf.is_file() and re.search(pattern, pf.read_text(encoding="utf-8"), re.IGNORECASE):
                return task

    return pool[0] if len(pool) == 1 else None


def outcome_matches(expected: str, detected: str, intent_score: int) -> bool:
    if intent_score == 0:
        return False
    if expected == "intent_ok":
        return detected in ("intent_ok", "idle", "advance")
    return detected == expected


def score_run(
    run: dict,
    tasks: list[dict] | None = None,
    log_text: str | None = None,
) -> dict:
    intent_score = 1 if run.get("intent") == "INTENT_OK" else 0
    exit_bonus = 1 if run.get("exit_code", 1) == 0 else 0

    if log_text is None:
        raw = run.get("log_path") or ""
        log_text = read_log_tail(Path(raw) if raw else None)

    detected = detect_outcome(run, log_text)
    matched = match_task(run, tasks or [], log_text) if tasks else None

    outcome_score: int | None = None
    outcome_match: bool | None = None
    if matched:
        expected = matched.get("expected_outcome", "intent_ok")
        outcome_match = outcome_matches(expected, detected, intent_score)
        outcome_score = 1 if outcome_match else 0

    total = intent_score + exit_bonus + (outcome_score or 0)
    return {
        "pod": run.get("pod"),
        "intent_score": intent_score,
        "exit_bonus": exit_bonus,
        "detected_outcome": detected,
        "outcome_score": outcome_score,
        "outcome_match": outcome_match,
        "matched_task_id": matched.get("id") if matched else None,
        "total": total,
    }


def iter_run_files(runs_dir: Path):
    if not runs_dir.is_dir():
        return
    for pod_dir in sorted(runs_dir.iterdir()):
        if not pod_dir.is_dir():
            continue
        for path in sorted(pod_dir.glob("*.json")):
            yield path


def load_tasks() -> list[dict]:
    if not EVAL_TASKS_PATH.is_file():
        return []
    return load_json(EVAL_TASKS_PATH).get("tasks", [])


def score_path(path: Path, tasks: list[dict]) -> dict:
    result = score_run(load_json(path), tasks)
    try:
        result["run_file"] = str(path.relative_to(REPO_ROOT))
    except ValueError:
        result["run_file"] = str(path)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score meta-harness pod tick runs")
    parser.add_argument("run_json", nargs="?", help="Path to a run JSON file")
    parser.add_argument(
        "--campaign",
        action="store_true",
        help="Score every run under agents/meta-harness/runs/",
    )
    parser.add_argument(
        "--self-check",
        action="store_true",
        help="Run inline assertions and exit",
    )
    args = parser.parse_args(argv)

    if args.self_check:
        _self_check()
        return 0

    tasks = load_tasks()

    if args.campaign:
        scores = [score_path(p, tasks) for p in iter_run_files(RUNS_DIR)]
        print(json.dumps({"campaign": True, "count": len(scores), "scores": scores}, indent=2))
        return 0

    if not args.run_json:
        parser.error("run_json required unless --campaign or --self-check")

    print(json.dumps(score_path(Path(args.run_json), tasks), indent=2))
    return 0


def _self_check() -> None:
    idle_run = {"pod": "fast", "exit_code": 0, "intent": "INTENT_OK", "log_path": ""}
    s = score_run(idle_run, tasks=[], log_text="reply IDLE only\n")
    assert s["intent_score"] == 1 and s["exit_bonus"] == 1 and s["detected_outcome"] == "idle"

    fail_run = {"pod": "think", "exit_code": 1, "intent": "INTENT_FAIL"}
    s2 = score_run(fail_run, tasks=[], log_text="")
    assert s2["intent_score"] == 0 and s2["exit_bonus"] == 0

    tasks = [{"id": "t1", "pod": "fast", "expected_outcome": "idle"}]
    s3 = score_run(idle_run, tasks=tasks, log_text="IDLE\n")
    assert s3["outcome_score"] == 1 and s3["total"] == 3

    print("score_tick self-check OK")


if __name__ == "__main__":
    raise SystemExit(main())

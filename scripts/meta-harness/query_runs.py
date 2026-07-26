#!/usr/bin/env python3
"""Query meta-harness run traces under agents/meta-harness/runs/. Stdlib only."""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

LOG_TAIL_LINES = 40


def repo_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env = os.environ.get("AGENT_DUMP")
    if env:
        return Path(env).resolve()
    return Path(__file__).resolve().parents[2]


def runs_root(repo: Path) -> Path:
    return repo / "agents" / "meta-harness" / "runs"


def is_failed(record: dict[str, Any]) -> bool:
    return record.get("intent") == "INTENT_FAIL" or record.get("exit_code", 0) != 0


def load_run(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def iter_runs(root: Path, pod: str | None = None) -> list[tuple[Path, dict[str, Any]]]:
    if not root.is_dir():
        return []
    pod_dirs = [root / pod] if pod else sorted(p for p in root.iterdir() if p.is_dir())
    out: list[tuple[Path, dict[str, Any]]] = []
    for pod_dir in pod_dirs:
        if not pod_dir.is_dir():
            continue
        for path in pod_dir.glob("*.json"):
            record = load_run(path)
            if record is not None:
                out.append((path, record))
    out.sort(key=lambda item: (item[0].stem, item[1].get("at", "")))
    return out


def emit_json(data: Any) -> None:
    json.dump(data, sys.stdout, indent=2)
    sys.stdout.write("\n")


def fmt_run_line(path: Path, record: dict[str, Any]) -> str:
    pod = record.get("pod", path.parent.name)
    at = record.get("at", path.stem)
    exit_code = record.get("exit_code", "?")
    intent = record.get("intent", "?")
    bootstrap = record.get("bootstrap", "?")
    return f"{pod:20} {at:26} exit={exit_code:<3} {intent:12} bootstrap={bootstrap}  {path}"


def cmd_last(root: Path, pod: str, n: int, as_json: bool) -> int:
    runs = iter_runs(root, pod)
    latest = runs[-n:] if n else runs
    if as_json:
        emit_json([{"path": str(p), **r} for p, r in latest])
        return 0
    if not latest:
        print(f"No runs for pod {pod!r} under {root / pod}")
        return 0
    for path, record in latest:
        print(fmt_run_line(path, record))
    return 0


def cmd_failed(root: Path, as_json: bool) -> int:
    failed = [(p, r) for p, r in iter_runs(root) if is_failed(r)]
    if as_json:
        emit_json([{"path": str(p), **r} for p, r in failed])
        return 0
    if not failed:
        print("No failed runs.")
        return 0
    for path, record in failed:
        print(fmt_run_line(path, record))
    return 0


def cmd_summary(root: Path, as_json: bool) -> int:
    stats: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "ok": 0, "exit_sum": 0})
    for _, record in iter_runs(root):
        pod = str(record.get("pod", "unknown"))
        stats[pod]["count"] += 1
        if not is_failed(record):
            stats[pod]["ok"] += 1
        stats[pod]["exit_sum"] += float(record.get("exit_code", 0))

    rows = []
    for pod in sorted(stats):
        s = stats[pod]
        count = int(s["count"])
        ok_pct = (100.0 * s["ok"] / count) if count else 0.0
        avg_exit = s["exit_sum"] / count if count else 0.0
        rows.append({"pod": pod, "count": count, "ok_pct": round(ok_pct, 1), "avg_exit": round(avg_exit, 2)})

    if as_json:
        emit_json(rows)
        return 0
    if not rows:
        print(f"No runs under {root}")
        return 0
    print(f"{'pod':<20} {'count':>6} {'ok%':>7} {'avg_exit':>9}")
    for row in rows:
        print(f"{row['pod']:<20} {row['count']:>6} {row['ok_pct']:>6.1f}% {row['avg_exit']:>9.2f}")
    return 0


def tail_log(log_path: str, lines: int = LOG_TAIL_LINES) -> list[str]:
    path = Path(log_path)
    if not path.is_file():
        return []
    try:
        content = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    return content[-lines:]


def cmd_show(path_arg: str, as_json: bool) -> int:
    path = Path(path_arg)
    if not path.is_file():
        print(f"Not found: {path}", file=sys.stderr)
        return 1
    record = load_run(path)
    if record is None:
        print(f"Invalid JSON: {path}", file=sys.stderr)
        return 1

    log_path = record.get("log_path", "")
    log_tail = tail_log(log_path) if log_path else []

    if as_json:
        emit_json({"path": str(path), "record": record, "log_tail": log_tail})
        return 0

    print(f"=== {path} ===")
    print(json.dumps(record, indent=2))
    if log_path:
        print(f"\n=== log tail ({log_path}) ===")
        if log_tail:
            print("\n".join(log_tail))
        else:
            print("(file missing or unreadable)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Query agents/meta-harness/runs/ traces")
    ap.add_argument("--repo", help="agent-dump root (default: AGENT_DUMP or script parent)")
    ap.add_argument("--json", action="store_true", help="JSON output")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_last = sub.add_parser("last", help="Latest N runs for a pod")
    p_last.add_argument("--pod", required=True, help="Pod name (e.g. think)")
    p_last.add_argument("-n", type=int, default=5, help="Number of runs (default: 5)")

    sub.add_parser("failed", help="Runs with INTENT_FAIL or non-zero exit_code")

    sub.add_parser("summary", help="Per-pod counts, ok%%, avg exit_code")

    p_show = sub.add_parser("show", help="Pretty-print one run JSON + log tail")
    p_show.add_argument("path", help="Path to a run .json file")

    args = ap.parse_args()
    root = runs_root(repo_root(args.repo))

    if args.cmd == "last":
        return cmd_last(root, args.pod, args.n, args.json)
    if args.cmd == "failed":
        return cmd_failed(root, args.json)
    if args.cmd == "summary":
        return cmd_summary(root, args.json)
    if args.cmd == "show":
        return cmd_show(args.path, args.json)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

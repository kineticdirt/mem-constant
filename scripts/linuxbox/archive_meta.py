#!/usr/bin/env python3
"""Append meta for archive-stored logs (mem-constant: state on disk, not in context)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

MAX_RECENT = 48
MAX_INDEX_LINES = 400


def _repo() -> Path:
    return Path(__import__("os").environ.get("AGENT_DUMP", Path.home() / "agent-dump"))


def append_run(
    category: str,
    name: str,
    exit_code: int,
    log_path: str,
    summary: str = "",
    *,
    task_id: str = "",
    blurb: str = "",
    outcome: str = "",
    detail: str = "",
    report_path: str = "",
) -> None:
    repo = _repo()
    meta_path = repo / "agents" / "archive-meta.json"
    index_path = repo / "agents" / "state" / "run-index.jsonl"
    index_path.parent.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = {
        "ts": ts,
        "category": category,
        "name": name,
        "exit": exit_code,
        "log": log_path,
        "summary": (summary or "")[:240],
    }
    if task_id:
        entry["task_id"] = str(task_id)[:80]
    if blurb:
        entry["blurb"] = str(blurb)[:240]
    if detail:
        entry["detail"] = str(detail)[:240]
    elif blurb:
        entry["detail"] = str(blurb)[:240]
    if outcome:
        entry["outcome"] = str(outcome)[:32]
    if report_path:
        entry["report_path"] = str(report_path)[:400]

    with index_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # Trim index (keep meta small on SD / in git)
    lines = index_path.read_text(encoding="utf-8").splitlines()
    if len(lines) > MAX_INDEX_LINES:
        index_path.write_text("\n".join(lines[-MAX_INDEX_LINES:]) + "\n", encoding="utf-8")

    meta: dict = {}
    if meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    recent = meta.get("recent", [])
    recent.insert(0, entry)
    meta["recent"] = recent[:MAX_RECENT]
    meta["updated_at"] = ts
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Append meta for archive-stored logs.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("append")
    p.add_argument("category")
    p.add_argument("name")
    p.add_argument("exit_code", type=int)
    p.add_argument("log_path")
    p.add_argument("summary", nargs="?", default="")
    p.add_argument("--task-id", default="")
    p.add_argument("--blurb", default="")
    p.add_argument("--detail", default="", help="Hub detail line (defaults to --blurb)")
    p.add_argument("--outcome", default="")
    p.add_argument("--report", default="", dest="report_path")
    args = ap.parse_args()
    if args.cmd != "append":
        return 2
    append_run(
        args.category,
        args.name,
        args.exit_code,
        args.log_path,
        args.summary,
        task_id=args.task_id,
        blurb=args.blurb or args.detail,
        outcome=args.outcome,
        detail=args.detail or args.blurb,
        report_path=args.report_path,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
